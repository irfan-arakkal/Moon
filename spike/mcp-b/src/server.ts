import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { z } from "zod";

const ACCESS_KEY = process.env.MCP_ACCESS_KEY;
if (!ACCESS_KEY) {
  console.error("MCP_ACCESS_KEY is not set (read it from .env / env vars, never hardcode it).");
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 8787);

function buildServer() {
  const server = new McpServer({ name: "mcp-b-spike", version: "1.0.0" });

  server.registerTool(
    "hello",
    {
      title: "Hello",
      description: "Minimal spike tool: returns a static greeting to prove MCP B is reachable end-to-end.",
      inputSchema: z.object({
        name: z.string().optional().describe("Optional name to greet"),
      }),
    },
    async ({ name }) => ({
      content: [
        {
          type: "text",
          text: `Hello${name ? `, ${name}` : ""} — MCP B spike is alive.`,
        },
      ],
    }),
  );

  return server;
}

const app = new Hono();

app.all("/mcp", async (c) => {
  const authHeader = c.req.header("authorization");
  const expected = `Bearer ${ACCESS_KEY}`;
  if (authHeader !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Stateless mode: one server + one transport per request, as documented
  // for the Web Standard transport (no session tracking needed for this spike).
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`MCP B spike listening on http://localhost:${info.port}/mcp`);
});
