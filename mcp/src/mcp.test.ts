// Integration test: real MCP B over HTTP (official client) -> real Moon API (in-memory DB).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { openDb } from '../../web/server/db.ts';
import { createApi } from '../../web/server/app.ts';
import { MoonApi } from './api.ts';
import { createMcpApp } from './server.ts';

const API_KEY = 'api-key';
const ACCESS_KEY = 'access-key';
let apiServer: Server;
let mcpServer: Server;
let apiBase: string;
let mcpUrl: string;

before(async () => {
  const app = express();
  app.use('/api', createApi({ store: openDb(':memory:'), apiKey: API_KEY }));
  apiServer = app.listen(0);
  await new Promise((r) => apiServer.once('listening', r));
  apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api`;

  const { app: mcpApp } = createMcpApp({ accessKey: ACCESS_KEY, api: new MoonApi(apiBase, API_KEY) });
  await new Promise<void>((resolve) => {
    mcpServer = serve({ fetch: mcpApp.fetch, port: 0 }, (info) => {
      mcpUrl = `http://127.0.0.1:${info.port}/mcp`;
      resolve();
    }) as Server;
  });
});
after(() => {
  for (const s of [mcpServer, apiServer]) {
    s.close();
    s.closeAllConnections(); // keep-alive sockets would otherwise keep the test process alive
  }
});

const connect = async () => {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { authorization: `Bearer ${ACCESS_KEY}` } } }));
  return client;
};
const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: !!res.isError, text: res.content[0].text, json: res.isError ? null : JSON.parse(res.content[0].text) };
};
const rest = async (path: string, init: RequestInit = {}) =>
  (await fetch(apiBase + path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` } })).json() as Promise<any>;

test('rejects calls without the access key', async () => {
  const res = await fetch(mcpUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 401);
});

test('create -> add -> connect -> validate -> update -> remove, all visible in the activity feed', async () => {
  const api = new MoonApi(apiBase, API_KEY);
  const clientRow = await rest('/clients', { method: 'POST', body: JSON.stringify({ name: 'Cabinet' }) });
  const client = await connect();

  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ['create_workflow', 'get_workflow', 'add_node', 'update_node', 'remove_node', 'connect_nodes', 'validate_workflow']) assert.ok(names.includes(n), n);

  // clientId omitted: allowed because exactly one client exists
  const wf = (await call(client, 'create_workflow', { name: 'Factures', sourceMode: 'screenpipe_recorded' })).json;
  assert.equal(wf.clientId, clientRow.id);

  const obs = [{ text: 'Facture F-1', app: 'Gmail', timestamp: '2026-10-17T09:00:00Z' }];
  await call(client, 'add_node', { workflowId: wf.id, id: 'a', type: 'trigger', title: 'Mail reçu', origin: 'observed', observations: obs });
  await call(client, 'add_node', { workflowId: wf.id, id: 'b', type: 'action', title: 'Saisie', origin: 'inferred' });
  await call(client, 'connect_nodes', { workflowId: wf.id, source: 'a', target: 'b' });
  assert.equal((await call(client, 'validate_workflow', { workflowId: wf.id })).json.valid, true);

  await call(client, 'update_node', { workflowId: wf.id, nodeId: 'b', title: 'Saisie tableur' });
  const read = (await call(client, 'get_workflow', { workflowId: wf.id })).json;
  assert.equal(read.nodes.find((n: any) => n.id === 'b').title, 'Saisie tableur');
  assert.equal(read.nodes.find((n: any) => n.id === 'a').origin, 'observed');

  assert.equal((await call(client, 'remove_node', { workflowId: wf.id, nodeId: 'b' })).json.removedEdges, 1);

  const activity = (await rest(`/workflows/${wf.id}/activity`)) as { tool: string; status: string }[];
  const tools = activity.map((e) => e.tool);
  for (const t of ['create_workflow', 'add_node', 'connect_nodes', 'validate_workflow', 'update_node', 'get_workflow', 'remove_node']) assert.ok(tools.includes(t), t);
  void api;
});

test('invalid calls return a tool error and are logged as errors', async () => {
  const client = await connect();
  const wf = (await call(client, 'create_workflow', { name: 'X', sourceMode: 'manual' })).json;
  const bad = await call(client, 'add_node', { workflowId: wf.id, type: 'action', title: 'Sans preuve', origin: 'observed', observations: [{ text: 't', app: 'Gmail', timestamp: 'pas-une-date' }] });
  assert.equal(bad.isError, true);
  const missing = await call(client, 'connect_nodes', { workflowId: wf.id, source: 'nope', target: 'nada' });
  assert.equal(missing.isError, true);
  const activity = (await rest(`/workflows/${wf.id}/activity`)) as { tool: string; status: string }[];
  assert.ok(activity.some((e) => e.tool === 'connect_nodes' && e.status === 'error'));
});

test('ownership: a workflow cannot be mutated through another client', async () => {
  const client = await connect();
  const other = await rest('/clients', { method: 'POST', body: JSON.stringify({ name: 'Autre' }) });
  const wfs = await rest('/clients');
  const owner = wfs.find((c: any) => c.id !== other.id);
  const wf = (await call(client, 'create_workflow', { clientId: owner.id, name: 'Privé', sourceMode: 'manual' })).json;
  const res = await call(client, 'add_node', { workflowId: wf.id, clientId: other.id, type: 'trigger', title: 'T', origin: 'inferred' });
  assert.equal(res.isError, true);
  assert.match(res.text, /n’appartient pas/);
});
