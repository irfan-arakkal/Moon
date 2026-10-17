// In-app Claude assistant (right panel composer). Real calls only. Claude answers any question,
// can search the web (Anthropic's server-side web search, with sources), and edits the workflow
// through the same tools as MCP B (mcp/src/tools.ts), which go through the REST API, so every
// change is validated and recorded in the activity feed. It cannot read Screenpipe from here.
// Env: ANTHROPIC_API_KEY (required to enable it), ASSISTANT_ACCESS_CODE (required in production).

import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Router, json, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { MoonApi } from '../../mcp/src/api.ts';
import { buildTools } from '../../mcp/src/tools.ts';

const MODEL = 'claude-sonnet-5-5';
// Editing-only subset: Screenpipe status and client creation stay with Claude Code + MCP B.
const ALLOWED = new Set(['get_workflow', 'add_node', 'update_node', 'remove_node', 'connect_nodes', 'validate_workflow', 'set_workflow_status']);
const MAX_TURNS = 20;

const SYSTEM = `Tu es Claude, l'assistant intégré à Moon, une application qui transforme l'activité observée d'un client (capturée par Screenpipe) en workflow à automatiser.
Tu réponds en français, de façon claire et concise, à toute question de l'utilisateur, liée ou non au workflow.
Pour une information récente ou incertaine, utilise la recherche web et appuie ta réponse sur les sources trouvées.
Tu peux aussi lire et modifier le workflow courant avec les outils fournis ; chaque appel est visible par l'utilisateur.
Règles d'honnêteté :
- Tu n'as PAS accès à Screenpipe ici. Ne prétends jamais avoir lu des captures dans cette conversation.
- Une étape « observée » doit s'appuyer sur des observations déjà présentes ; n'invente jamais d'observation. Toute étape que tu ajoutes ou déduis est « inferred ».
- Pour expliquer d'où vient une étape, appuie-toi sur ses observations et son origine telles qu'enregistrées.
- Avant de modifier, lis le workflow (get_workflow) si tu as besoin des identifiants ; après une modification, lance validate_workflow.
- Ne dis qu'une opération a réussi que si l'outil a renvoyé un succès.`;

type ChatTurn = { role: 'user' | 'assistant'; content: string };
type Step = { tool: string; ok: boolean; summary: string };
type Source = { url: string; title: string | null };

const WEB_SEARCH: Anthropic.Beta.BetaWebSearchTool20260209 = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };

export function assistantRouter(opts: { apiBase: string; apiKey: string | undefined; isProd: boolean }) {
  const enabled = !!process.env.ANTHROPIC_API_KEY;
  const code = process.env.ASSISTANT_ACCESS_CODE || undefined;
  const disabledReason = !enabled
    ? 'ANTHROPIC_API_KEY non configurée sur le serveur.'
    : opts.isProd && !code
      ? 'ASSISTANT_ACCESS_CODE non configuré : assistant désactivé en production.'
      : null;
  const client = enabled ? new Anthropic() : null;
  const api = new MoonApi(opts.apiBase, opts.apiKey);
  const tools = buildTools(api).filter((t) => ALLOWED.has(t.name));

  const codeOk = (req: Request) => {
    if (!code) return true;
    const given = Buffer.from(String(req.header('x-assistant-code') ?? ''));
    const expected = Buffer.from(code);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  const router = Router();
  router.use(json({ limit: '200kb' }));

  router.get('/status', (_req, res) => {
    res.json({ enabled: !disabledReason, reason: disabledReason, needsCode: !!code, model: MODEL });
  });

  router.post('/', async (req: Request, res: Response) => {
    if (disabledReason || !client) return void res.status(503).json({ error: disabledReason });
    if (!codeOk(req)) return void res.status(401).json({ error: 'Code d’accès invalide.' });

    const { workflowId, messages } = (req.body ?? {}) as { workflowId?: unknown; messages?: unknown };
    if (typeof workflowId !== 'string' || !Array.isArray(messages) || messages.length === 0) {
      return void res.status(400).json({ error: '"workflowId" et "messages" sont requis.' });
    }
    const history = (messages as ChatTurn[])
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (history[history.length - 1]?.role !== 'user') return void res.status(400).json({ error: 'Le dernier message doit venir de l’utilisateur.' });

    const steps: Step[] = [];
    const runnable = tools.map((t) =>
      betaZodTool({
        name: t.name,
        description: t.description,
        inputSchema: t.schema,
        run: async (args) => {
          try {
            const out = await t.run(args);
            steps.push({ tool: t.name, ok: true, summary: 'succès' });
            return JSON.stringify(out);
          } catch (err) {
            const msg = (err as Error).message;
            steps.push({ tool: t.name, ok: false, summary: msg });
            return `Erreur : ${msg}`;
          }
        },
      }),
    );

    try {
      const runner = client.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: `${SYSTEM}\n\nWorkflow courant : ${workflowId}`,
        tools: [...runnable, WEB_SEARCH],
        messages: history,
        max_iterations: 12,
      });
      // The runner does not resume a paused server-tool turn by itself: push it back.
      for await (const msg of runner) {
        for (const b of msg.content) {
          if (b.type === 'server_tool_use' && b.name === 'web_search') {
            const query = (b.input as { query?: string } | null)?.query;
            steps.push({ tool: 'web_search', ok: true, summary: query ?? 'recherche web' });
          }
        }
        if (msg.stop_reason === 'pause_turn') runner.pushMessages({ role: 'assistant', content: msg.content });
      }
      const final = await runner.done();
      if (final.stop_reason === 'refusal') {
        return void res.json({ reply: 'Claude a refusé cette demande.', steps, sources: [] });
      }
      const texts = final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
      const reply = texts.map((b) => b.text).join('').trim();
      const sources = new Map<string, Source>();
      for (const b of texts) {
        for (const c of b.citations ?? []) {
          if (c.type === 'web_search_result_location' && !sources.has(c.url)) sources.set(c.url, { url: c.url, title: c.title });
        }
      }
      res.json({ reply: reply || (steps.length ? 'Modifications effectuées.' : '(pas de réponse)'), steps, sources: [...sources.values()] });
    } catch (err) {
      const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 500;
      const message =
        err instanceof Anthropic.AuthenticationError
          ? 'Clé Anthropic invalide.'
          : err instanceof Anthropic.RateLimitError
            ? 'Limite de requêtes atteinte, réessayez dans un instant.'
            : `Erreur de l’assistant : ${(err as Error).message}`;
      res.status(status >= 400 && status < 600 ? status : 502).json({ error: message, steps });
    }
  });

  return router;
}
