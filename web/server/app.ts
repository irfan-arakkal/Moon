// REST API (contract in shared/api.ts). Used by the front (reads) and MCP B (writes).

import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { ValidationResult, Workflow } from '@moon/shared';
import { ConflictError, NotFoundError, type Store } from './db.ts';
import * as v from './validate.ts';

const SOURCE_MODES = ['screenpipe_live', 'screenpipe_recorded', 'manual'] as const;
const STATUSES = ['draft', 'analyzing', 'ready', 'error'] as const;
const NODE_TYPES = ['trigger', 'action', 'condition', 'end'] as const;
const ORIGINS = ['observed', 'inferred'] as const;

export interface AppOptions {
  store: Store;
  /** Secret required on write routes. If undefined, writes are open (local dev only). */
  apiKey: string | undefined;
}

export function createApi({ store, apiKey }: AppOptions) {
  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));

  const requireKey = (req: Request, res: Response, next: NextFunction) => {
    if (apiKey === undefined) return next();
    const given = Buffer.from(req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
    const expected = Buffer.from(apiKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return res.status(401).json({ error: 'clé d’accès manquante ou invalide' });
    }
    next();
  };

  // Wraps a write handler: when called by MCP B (X-MCP-Tool header), the call is
  // recorded in the activity feed with its real outcome.
  const write =
    (fallbackWorkflowId: (req: Request) => string | null, run: (req: Request) => { status?: number; body: unknown; workflowId?: string; summary: string }) =>
    (req: Request, res: Response) => {
      const tool = req.header('x-mcp-tool')?.slice(0, 100);
      try {
        const out = run(req);
        if (tool) store.logActivity({ workflowId: out.workflowId ?? fallbackWorkflowId(req), tool, summary: out.summary, status: 'success' });
        res.status(out.status ?? 200).json(out.body);
      } catch (err) {
        const { status, message } = toHttpError(err);
        if (tool) {
          const wfId = fallbackWorkflowId(req);
          // Only attach to a workflow that exists, otherwise keep it unattached.
          const known = wfId && safe(() => store.getWorkflow(wfId)) ? wfId : null;
          store.logActivity({ workflowId: known, tool, summary: `Échec : ${message}`, status: 'error' });
        }
        res.status(status).json({ error: message });
      }
    };

  const read = (run: (req: Request) => unknown) => (req: Request, res: Response) => {
    try {
      res.json(run(req));
    } catch (err) {
      const { status, message } = toHttpError(err);
      res.status(status).json({ error: message });
    }
  };

  const wfParam = (req: Request) => String(req.params.id);

  // Verifies the workflow belongs to the client named in the body, if any (CLAUDE.md §6).
  const checkOwner = (wf: Workflow, body: Record<string, unknown>) => {
    if (body.clientId !== undefined && body.clientId !== wf.clientId) {
      throw new ConflictError(`le workflow ${wf.id} n’appartient pas au client ${String(body.clientId)}`);
    }
  };

  // ---------- reads ----------

  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/clients', read(() => store.listClients()));
  api.get('/workflows/:id', read((req) => store.getWorkflow(wfParam(req))));
  api.get('/workflows/:id/activity', read((req) => {
    store.getWorkflow(wfParam(req));
    return store.listActivity(wfParam(req));
  }));
  api.get('/workflows/:id/validate', read((req) => validateWorkflow(store.getWorkflow(wfParam(req)))));
  api.get('/mcp/tools', read(() => store.listMcpTools()));

  // ---------- writes ----------

  api.post('/clients', requireKey, write(() => null, (req) => {
    const b = v.asObject(req.body);
    const client = store.createClient(v.str(b, 'name', { max: 200 }), b.isExample === true);
    return { status: 201, body: client, summary: `Client « ${client.name} » créé` };
  }));

  api.post('/clients/:id/screenpipe-status', requireKey, write(() => null, (req) => {
    const b = v.asObject(req.body);
    const status = v.oneOf(b, 'status', ['connected', 'disconnected'] as const);
    const lastSeenAt = v.nullableStr(b, 'lastSeenAt') ?? null;
    if (lastSeenAt && isNaN(Date.parse(lastSeenAt))) throw new v.ValidationError('"lastSeenAt" doit être une date ISO');
    const client = store.setScreenpipeStatus(String(req.params.id), status, lastSeenAt);
    return { body: client, summary: `Statut Screenpipe : ${status}` };
  }));

  api.post('/workflows', requireKey, write(() => null, (req) => {
    const b = v.asObject(req.body);
    const wf = store.createWorkflow({
      clientId: v.str(b, 'clientId', { max: 100 }),
      name: v.str(b, 'name', { max: 200 }),
      description: v.str(b, 'description', { optional: true }) ?? '',
      sourceMode: v.oneOf(b, 'sourceMode', SOURCE_MODES),
      status: v.oneOf(b, 'status', STATUSES, true) ?? 'draft',
      uncertainties: v.strArray(b, 'uncertainties') ?? [],
    });
    return { status: 201, body: wf, workflowId: wf.id, summary: `Workflow « ${wf.name} » créé` };
  }));

  api.patch('/workflows/:id', requireKey, write(wfParam, (req) => {
    const b = v.asObject(req.body);
    checkOwner(store.getWorkflow(wfParam(req)), b);
    const wf = store.updateWorkflow(wfParam(req), {
      name: v.str(b, 'name', { optional: true, max: 200 }),
      description: v.str(b, 'description', { optional: true }),
      status: v.oneOf(b, 'status', STATUSES, true),
      uncertainties: v.strArray(b, 'uncertainties'),
    });
    return { body: wf, summary: `Workflow mis à jour (statut : ${wf.status})` };
  }));

  api.post('/workflows/:id/nodes', requireKey, write(wfParam, (req) => {
    const b = v.asObject(req.body);
    checkOwner(store.getWorkflow(wfParam(req)), b);
    const node = store.addNode(wfParam(req), {
      id: v.str(b, 'id', { optional: true, max: 100 }),
      type: v.oneOf(b, 'type', NODE_TYPES),
      title: v.str(b, 'title', { max: 200 }),
      description: v.str(b, 'description', { optional: true }) ?? '',
      app: v.nullableStr(b, 'app') ?? null,
      origin: v.oneOf(b, 'origin', ORIGINS),
      observations: v.observations(b, 'observations') ?? [],
      position: v.position(b, 'position') ?? null,
    });
    const label = node.origin === 'observed' ? 'observée' : 'inférée';
    return { status: 201, body: node, summary: `Étape ajoutée : « ${node.title} » (${label})` };
  }));

  api.patch('/workflows/:id/nodes/:nodeId', requireKey, write(wfParam, (req) => {
    const b = v.asObject(req.body);
    checkOwner(store.getWorkflow(wfParam(req)), b);
    const node = store.updateNode(wfParam(req), String(req.params.nodeId), {
      type: v.oneOf(b, 'type', NODE_TYPES, true),
      title: v.str(b, 'title', { optional: true, max: 200 }),
      description: v.str(b, 'description', { optional: true }),
      app: v.nullableStr(b, 'app'),
      origin: v.oneOf(b, 'origin', ORIGINS, true),
      observations: v.observations(b, 'observations'),
      position: v.position(b, 'position'),
    });
    return { body: node, summary: `Étape modifiée : « ${node.title} »` };
  }));

  api.delete('/workflows/:id/nodes/:nodeId', requireKey, write(wfParam, (req) => {
    const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    checkOwner(store.getWorkflow(wfParam(req)), b);
    const nodeId = String(req.params.nodeId);
    const title = store.findNode(wfParam(req), nodeId)?.title ?? nodeId;
    const { removedEdges } = store.tx(() => store.removeNode(wfParam(req), nodeId));
    return { body: { removed: nodeId, removedEdges }, summary: `Étape supprimée : « ${title} » (${removedEdges} connexion(s) retirée(s))` };
  }));

  api.post('/workflows/:id/edges', requireKey, write(wfParam, (req) => {
    const b = v.asObject(req.body);
    checkOwner(store.getWorkflow(wfParam(req)), b);
    const edge = store.connectNodes(
      wfParam(req),
      v.str(b, 'source', { max: 100 }),
      v.str(b, 'target', { max: 100 }),
      v.nullableStr(b, 'label') ?? null,
    );
    const wf = store.getWorkflow(wfParam(req));
    const name = (id: string) => wf.nodes.find((n) => n.id === id)?.title ?? id;
    return {
      status: 201,
      body: edge,
      summary: `Connexion : « ${name(edge.source)} » → « ${name(edge.target)} »${edge.label ? ` [${edge.label}]` : ''}`,
    };
  }));

  api.delete('/workflows/:id/edges/:edgeId', requireKey, write(wfParam, (req) => {
    store.removeEdge(wfParam(req), String(req.params.edgeId));
    return { body: { removed: req.params.edgeId }, summary: `Connexion supprimée` };
  }));

  api.post('/activity', requireKey, (req, res) => {
    try {
      const b = v.asObject(req.body);
      const workflowId = v.nullableStr(b, 'workflowId') ?? null;
      if (workflowId) store.getWorkflow(workflowId);
      const event = store.logActivity({
        workflowId,
        tool: v.str(b, 'tool', { max: 100 }),
        summary: v.str(b, 'summary', { max: 1000 }),
        status: v.oneOf(b, 'status', ['success', 'error'] as const),
      });
      res.status(201).json(event);
    } catch (err) {
      const { status, message } = toHttpError(err);
      res.status(status).json({ error: message });
    }
  });

  api.put('/mcp/tools', requireKey, read((req) => {
    const b = v.asObject(req.body);
    if (!Array.isArray(b.tools)) throw new v.ValidationError('"tools" doit être une liste');
    const tools = b.tools.map((t) => {
      const o = v.asObject(t);
      return { name: v.str(o, 'name', { max: 100 }), description: v.str(o, 'description', { optional: true }) ?? '' };
    });
    store.setMcpTools(tools);
    return store.listMcpTools();
  }));

  api.use((_req, res) => res.status(404).json({ error: 'route inconnue' }));
  return api;
}

/** Structural checks of a workflow (also used by MCP B's validate_workflow). */
export function validateWorkflow(wf: Workflow): ValidationResult {
  const errors: string[] = [];
  const ids = new Set(wf.nodes.map((n) => n.id));
  if (wf.nodes.length === 0) errors.push('le workflow ne contient aucune étape');
  for (const e of wf.edges) {
    if (!ids.has(e.source)) errors.push(`connexion ${e.id} : source ${e.source} inconnue`);
    if (!ids.has(e.target)) errors.push(`connexion ${e.id} : cible ${e.target} inconnue`);
  }
  if (!wf.nodes.some((n) => n.type === 'trigger')) errors.push('aucune étape de type "trigger" (déclencheur)');
  if (wf.nodes.length > 1) {
    const linked = new Set(wf.edges.flatMap((e) => [e.source, e.target]));
    for (const n of wf.nodes) if (!linked.has(n.id)) errors.push(`l’étape « ${n.title} » n’est reliée à rien`);
  }
  for (const n of wf.nodes) {
    if (n.origin === 'observed' && n.observations.length === 0)
      errors.push(`l’étape « ${n.title} » est marquée observée mais n’a aucune observation`);
    if (n.type === 'condition' && wf.edges.filter((e) => e.source === n.id).length < 2)
      errors.push(`la condition « ${n.title} » devrait avoir deux sorties`);
  }
  return { valid: errors.length === 0, errors };
}

function toHttpError(err: unknown): { status: number; message: string } {
  if (err instanceof v.ValidationError) return { status: 400, message: err.message };
  if (err instanceof NotFoundError) return { status: 404, message: err.message };
  if (err instanceof ConflictError) return { status: 409, message: err.message };
  console.error(err);
  return { status: 500, message: 'erreur interne' };
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
