// MCP B — Streamable HTTP server exposing the workflow tools (CLAUDE.md §6).
// Env: MCP_ACCESS_KEY (required), MOON_API_URL, MOON_API_KEY, PORT.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { timingSafeEqual } from 'node:crypto';
import { MoonApi } from './api.ts';
import { buildTools } from './tools.ts';

const toText = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

export function createMcpApp(opts: { accessKey: string; api: MoonApi }) {
  const tools = buildTools(opts.api);
  const expected = Buffer.from(`Bearer ${opts.accessKey}`);

  const buildServer = () => {
    const server = new McpServer({ name: 'moon-mcp-b', version: '1.0.0' });
    for (const t of tools) {
      server.registerTool(t.name, { description: t.description, inputSchema: t.schema }, async (args: unknown) => {
        try {
          return toText(await t.run(args));
        } catch (err) {
          return { isError: true, content: [{ type: 'text' as const, text: `Erreur : ${(err as Error).message}` }] };
        }
      });
    }
    return server;
  };

  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true, tools: tools.map((t) => t.name) }));
  app.all('/mcp', async (c) => {
    const given = Buffer.from(c.req.header('authorization') ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return c.json({ error: 'unauthorized' }, 401);
    // Stateless: one server + transport per request.
    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });
  return { app, tools };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const accessKey = process.env.MCP_ACCESS_KEY;
  if (!accessKey) {
    console.error('MCP_ACCESS_KEY manquante : refus de démarrer (jamais de clé dans le code).');
    process.exit(1);
  }
  const apiUrl = process.env.MOON_API_URL ?? 'http://localhost:3000/api';
  const api = new MoonApi(apiUrl, process.env.MOON_API_KEY);
  const { app, tools } = createMcpApp({ accessKey, api });
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, (info) => console.log(`MCP B sur http://localhost:${info.port}/mcp (API : ${apiUrl})`));

  // Publish the real tool list so the UI's "Outils MCP disponibles" block is truthful.
  api
    .registerTools(tools.map((t) => ({ name: t.name, description: t.description })))
    .then(() => console.log(`${tools.length} outils déclarés à l’API`))
    .catch((err) => console.warn(`Déclaration des outils impossible (l’API est-elle lancée ?) : ${err.message}`));
}
