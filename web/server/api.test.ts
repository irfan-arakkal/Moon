import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from './db.ts';
import { createApi } from './app.ts';

const KEY = 'test-key';
let server: Server;
let base: string;

before(async () => {
  const app = express();
  app.use('/api', createApi({ store: openDb(':memory:'), apiKey: KEY }));
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const mcp = { 'x-mcp-tool': 'add_node' };

test('write routes require the API key', async () => {
  const res = await call('POST', '/clients', { name: 'X' }, { authorization: 'Bearer wrong' });
  assert.equal(res.status, 401);
});

test('full workflow lifecycle, activity log and validation', async () => {
  const client = (await call('POST', '/clients', { name: 'Cabinet' })).body;
  const wf = await call('POST', '/workflows', { clientId: client.id, name: 'Factures', sourceMode: 'screenpipe_live' }, { 'x-mcp-tool': 'create_workflow' });
  assert.equal(wf.status, 201);
  const id = wf.body.id;

  const obs = [{ text: 'Facture', app: 'Gmail', timestamp: '2026-10-17T09:00:00Z' }];
  assert.equal((await call('POST', `/workflows/${id}/nodes`, { id: 'a', type: 'trigger', title: 'Mail', origin: 'observed', observations: obs }, mcp)).status, 201);
  assert.equal((await call('POST', `/workflows/${id}/nodes`, { id: 'b', type: 'action', title: 'Saisie', origin: 'inferred' }, mcp)).status, 201);
  assert.equal((await call('POST', `/workflows/${id}/nodes`, { id: 'a', type: 'action', title: 'Dup', origin: 'inferred' }, mcp)).status, 409);
  assert.equal((await call('POST', `/workflows/${id}/nodes`, { type: 'nope', title: 'X', origin: 'inferred' }, mcp)).status, 400);
  assert.equal((await call('POST', `/workflows/${id}/edges`, { source: 'a', target: 'zzz' }, { 'x-mcp-tool': 'connect_nodes' })).status, 404);
  assert.equal((await call('POST', `/workflows/${id}/edges`, { source: 'a', target: 'b' }, { 'x-mcp-tool': 'connect_nodes' })).status, 201);

  // ownership check
  assert.equal((await call('PATCH', `/workflows/${id}/nodes/b`, { clientId: 'other', title: 'X' })).status, 409);
  assert.equal((await call('PATCH', `/workflows/${id}/nodes/b`, { clientId: client.id, title: 'Saisie tableur' }, { 'x-mcp-tool': 'update_node' })).status, 200);

  const got = (await call('GET', `/workflows/${id}`)).body;
  assert.equal(got.nodes.length, 2);
  assert.equal(got.edges.length, 1);
  assert.equal(got.nodes[1].title, 'Saisie tableur');
  assert.equal(got.nodes[0].observations[0].app, 'Gmail');

  assert.deepEqual((await call('GET', `/workflows/${id}/validate`)).body, { valid: true, errors: [] });

  const del = await call('DELETE', `/workflows/${id}/nodes/b`, undefined, { 'x-mcp-tool': 'remove_node' });
  assert.equal(del.body.removedEdges, 1);

  const activity = (await call('GET', `/workflows/${id}/activity`)).body;
  const tools = activity.map((a: { tool: string }) => a.tool);
  assert.ok(tools.includes('create_workflow'));
  assert.ok(tools.includes('remove_node'));
  assert.ok(activity.some((a: { status: string }) => a.status === 'error'), 'failed calls are logged as errors');
  // the ownership failure had no X-MCP-Tool header -> not logged
  assert.equal(activity.length, 9);
});

test('MCP tool registry', async () => {
  await call('PUT', '/mcp/tools', { tools: [{ name: 'add_node', description: 'Ajoute une étape' }] });
  assert.deepEqual((await call('GET', '/mcp/tools')).body, [{ name: 'add_node', description: 'Ajoute une étape' }]);
});
