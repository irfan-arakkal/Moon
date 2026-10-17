// Assistant wiring test: real Moon API + real assistant route + a local stand-in for the
// Anthropic Messages endpoint (ANTHROPIC_BASE_URL). The stand-in plays Claude's turns so the
// test checks our side: tool loop, REST writes, activity log, access code, request shape.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from './db.ts';
import { createApi } from './app.ts';
import { assistantRouter } from './assistant.ts';

const KEY = 'api-key';
let appServer: Server;
let fakeServer: Server;
let base: string;
const seen: any[] = [];
let wfId = '';

const listen = async (app: express.Express) => {
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  return s;
};
const message = (content: unknown[], stop_reason: string) => ({
  id: `msg_${seen.length}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
  content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
});

before(async () => {
  // Stand-in for the Anthropic API: turn 1 asks for add_node, turn 2 answers.
  const fake = express();
  fake.use(express.json({ limit: '5mb' }));
  fake.post('/v1/messages', (req, res) => {
    seen.push(req.body);
    if (seen.length === 1) {
      res.json(message([{ type: 'tool_use', id: 'tu_1', name: 'add_node', input: { workflowId: wfId, id: 'n9', type: 'action', title: 'Archiver la facture', origin: 'inferred' } }], 'tool_use'));
    } else {
      // Turn 2: a server-side web search, then a cited answer (shape of web_search_20260209 results).
      res.json(
        message(
          [
            { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'délai légal conservation factures' } },
            { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', url: 'https://example.org/factures', title: 'Conservation des factures', encrypted_content: 'x', page_age: null }] },
            { type: 'text', text: 'Étape « Archiver la facture » ajoutée. ' },
            {
              type: 'text',
              text: 'Les factures se conservent 10 ans.',
              citations: [{ type: 'web_search_result_location', url: 'https://example.org/factures', title: 'Conservation des factures', cited_text: '10 ans', encrypted_index: 'e' }],
            },
          ],
          'end_turn',
        ),
      );
    }
  });
  fakeServer = await listen(fake);
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fakeServer.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.ASSISTANT_ACCESS_CODE = 'sesame';

  const app = express();
  appServer = await listen(app);
  base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}/api`;
  app.use('/api/assistant', assistantRouter({ apiBase: base, apiKey: KEY, isProd: false }));
  app.use('/api', createApi({ store: openDb(':memory:'), apiKey: KEY }));

  const h = { 'content-type': 'application/json', authorization: `Bearer ${KEY}` };
  const client = await (await fetch(`${base}/clients`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'Cabinet' }) })).json();
  wfId = (await (await fetch(`${base}/workflows`, { method: 'POST', headers: h, body: JSON.stringify({ clientId: client.id, name: 'Factures', sourceMode: 'manual' }) })).json()).id;
});
after(() => {
  for (const s of [appServer, fakeServer]) {
    s.close();
    s.closeAllConnections();
  }
});

const ask = (code?: string) =>
  fetch(`${base}/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(code ? { 'x-assistant-code': code } : {}) },
    body: JSON.stringify({ workflowId: wfId, messages: [{ role: 'user', content: 'Ajoute une étape d’archivage' }] }),
  });

test('requires the access code', async () => {
  assert.equal((await ask()).status, 401);
  assert.equal((await ask('wrong')).status, 401);
  assert.equal(seen.length, 0);
});

test('runs the tool loop through the REST API and logs the activity', async () => {
  const res = await ask('sesame');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.steps, [
    { tool: 'add_node', ok: true, summary: 'succès' },
    { tool: 'web_search', ok: true, summary: 'délai légal conservation factures' },
  ]);
  assert.deepEqual(body.sources, [{ url: 'https://example.org/factures', title: 'Conservation des factures' }]);
  assert.match(body.reply, /Archiver la facture/);

  const wf = await (await fetch(`${base}/workflows/${wfId}`)).json();
  assert.equal(wf.nodes.find((n: any) => n.id === 'n9')?.origin, 'inferred');
  const activity = await (await fetch(`${base}/workflows/${wfId}/activity`)).json();
  assert.ok(activity.some((e: any) => e.tool === 'add_node' && e.status === 'success'));

  // Request shape sent to the Messages API
  const first = seen[0];
  assert.equal(first.model, 'claude-sonnet-5-5');
  assert.equal(first.fallbacks, 'default');
  const names = first.tools.map((t: any) => t.name);
  assert.ok(names.includes('add_node') && !names.includes('report_screenpipe_status'));
  assert.ok(first.tools.some((t: any) => t.type === 'web_search_20260209'));
  // Second turn carries the tool result back
  assert.ok(JSON.stringify(seen[1].messages).includes('tool_result'));
});
