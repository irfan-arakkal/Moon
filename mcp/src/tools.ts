// MCP B tools (CLAUDE.md §6). Each tool maps to one REST route of the Moon API, which
// validates the data and records the call (outcome included) in the activity feed.
// Reads (get/list/validate) are not logged by the API, so they are logged here.

import { z } from 'zod';
import type { Workflow } from '@moon/shared';
import { ApiCallError, type MoonApi } from './api.ts';

const origin = z.enum(['observed', 'inferred']).describe('observed = present in Screenpipe results (needs observations); inferred = deduced by you');
const nodeType = z.enum(['trigger', 'action', 'condition', 'end']);
const observation = z.object({
  text: z.string().describe('Text returned by Screenpipe, shortened to what is necessary (no passwords/tokens/bank data)'),
  app: z.string().describe('Application name as reported by Screenpipe'),
  timestamp: z.string().describe('ISO 8601 capture time'),
  windowName: z.string().optional(),
});
const position = z.object({ x: z.number(), y: z.number() }).nullable().optional().describe('Optional; the UI lays out the graph itself when omitted');

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (args: any) => Promise<unknown>;
}

const summarize = (wf: Workflow) => ({
  id: wf.id,
  clientId: wf.clientId,
  name: wf.name,
  description: wf.description,
  status: wf.status,
  sourceMode: wf.sourceMode,
  uncertainties: wf.uncertainties,
  nodes: wf.nodes.map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.description, app: n.app, origin: n.origin, observations: n.observations })),
  edges: wf.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
});

export function buildTools(api: MoonApi): ToolDef[] {
  // Logs a read-only call; a logging failure must not hide the real result.
  const logRead = async (tool: string, workflowId: string | null, summary: string, status: 'success' | 'error') => {
    try {
      await api.logActivity({ workflowId, tool, summary, status });
    } catch {
      /* best effort */
    }
  };

  return [
    {
      name: 'list_clients',
      description: 'List the clients known to the Moon app (id, name, workflows). Use it to find the clientId for create_workflow.',
      schema: z.object({}),
      run: async () => {
        const clients = await api.listClients();
        await logRead('list_clients', null, `${clients.length} client(s) listé(s)`, 'success');
        return clients.map((c) => ({ id: c.id, name: c.name, isExample: c.isExample, workflows: c.workflows }));
      },
    },
    {
      name: 'create_workflow',
      description:
        'Create an empty workflow for a client. sourceMode must be honest: screenpipe_live ONLY if you really retrieved the observations from Screenpipe (MCP A) in this session; screenpipe_recorded for a frozen recorded session; manual otherwise. Returns the workflow id to use with the other tools.',
      schema: z.object({
        clientId: z.string().optional().describe('Client id (see list_clients). Optional only when exactly one client exists.'),
        name: z.string(),
        description: z.string().optional().describe('Objective of the process'),
        sourceMode: z.enum(['screenpipe_live', 'screenpipe_recorded', 'manual']),
        status: z.enum(['draft', 'analyzing', 'ready', 'error']).optional(),
        uncertainties: z.array(z.string()).optional().describe('What the observations do not confirm'),
      }),
      run: async (a) => {
        let clientId = a.clientId as string | undefined;
        if (!clientId) {
          const clients = await api.listClients();
          if (clients.length !== 1) {
            throw new ApiCallError(400, `clientId requis (${clients.length} clients : ${clients.map((c) => `${c.name} = ${c.id}`).join(', ') || 'aucun'})`);
          }
          clientId = clients[0].id;
        }
        const wf = await api.createWorkflow({ ...a, clientId }, 'create_workflow');
        return { id: wf.id, clientId: wf.clientId, name: wf.name, status: wf.status, sourceMode: wf.sourceMode };
      },
    },
    {
      name: 'get_workflow',
      description: 'Read a workflow with its nodes (origin, observations) and edges, as currently stored and displayed.',
      schema: z.object({ workflowId: z.string() }),
      run: async (a) => {
        try {
          const wf = await api.getWorkflow(a.workflowId);
          await logRead('get_workflow', wf.id, `Workflow lu : ${wf.nodes.length} étape(s), ${wf.edges.length} connexion(s)`, 'success');
          return summarize(wf);
        } catch (err) {
          await logRead('get_workflow', null, `Échec : ${(err as Error).message}`, 'error');
          throw err;
        }
      },
    },
    {
      name: 'add_node',
      description:
        'Add a step to a workflow. origin=observed requires at least one Screenpipe observation (text, app, timestamp); anything you deduce is origin=inferred. Pass your own short id to reference the node in connect_nodes, or use the returned id.',
      schema: z.object({
        workflowId: z.string(),
        id: z.string().optional().describe('Optional unique id within the workflow'),
        type: nodeType,
        title: z.string(),
        description: z.string().optional(),
        app: z.string().nullable().optional().describe('Application the step happens in (Gmail, PDF, Excel…)'),
        origin,
        observations: z.array(observation).optional(),
        position,
        clientId: z.string().optional().describe('If given, the API checks the workflow belongs to this client'),
      }),
      run: async ({ workflowId, ...body }) => api.addNode(workflowId, body, 'add_node'),
    },
    {
      name: 'update_node',
      description: 'Modify fields of an existing step (all fields optional). Observations, when given, replace the existing ones.',
      schema: z.object({
        workflowId: z.string(),
        nodeId: z.string(),
        type: nodeType.optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        app: z.string().nullable().optional(),
        origin: origin.optional(),
        observations: z.array(observation).optional(),
        position,
        clientId: z.string().optional(),
      }),
      run: async ({ workflowId, nodeId, ...body }) => api.updateNode(workflowId, nodeId, body, 'update_node'),
    },
    {
      name: 'remove_node',
      description: 'Remove a step and every connection attached to it.',
      schema: z.object({ workflowId: z.string(), nodeId: z.string(), clientId: z.string().optional() }),
      run: async ({ workflowId, nodeId, clientId }) => {
        // The DELETE route has no body, so ownership is checked here.
        if (clientId) {
          const wf = await api.getWorkflow(workflowId);
          if (wf.clientId !== clientId) throw new ApiCallError(409, `le workflow ${workflowId} n’appartient pas au client ${clientId}`);
        }
        return api.removeNode(workflowId, nodeId, 'remove_node');
      },
    },
    {
      name: 'connect_nodes',
      description: 'Connect two steps of a workflow. Use label "true"/"false" on the outputs of a condition step.',
      schema: z.object({
        workflowId: z.string(),
        source: z.string().describe('Source node id'),
        target: z.string().describe('Target node id'),
        label: z.string().nullable().optional(),
        clientId: z.string().optional(),
      }),
      run: async ({ workflowId, ...body }) => api.connectNodes(workflowId, body, 'connect_nodes'),
    },
    {
      name: 'validate_workflow',
      description: 'Check the workflow structure: unknown references, missing trigger, unlinked steps, observed steps without observation, conditions with fewer than two outputs.',
      schema: z.object({ workflowId: z.string() }),
      run: async (a) => {
        try {
          const res = await api.validate(a.workflowId);
          await logRead('validate_workflow', a.workflowId, res.valid ? 'Workflow valide' : `${res.errors.length} problème(s) détecté(s)`, 'success');
          return res;
        } catch (err) {
          await logRead('validate_workflow', null, `Échec : ${(err as Error).message}`, 'error');
          throw err;
        }
      },
    },
    {
      name: 'set_workflow_status',
      description: 'Set the analysis status shown in the UI: analyzing (in progress), ready (result), error. Optionally report uncertainties.',
      schema: z.object({
        workflowId: z.string(),
        status: z.enum(['draft', 'analyzing', 'ready', 'error']),
        uncertainties: z.array(z.string()).optional(),
      }),
      run: async ({ workflowId, ...body }) => {
        const wf = await api.patchWorkflow(workflowId, body, 'set_workflow_status');
        return { id: wf.id, status: wf.status, uncertainties: wf.uncertainties };
      },
    },
  ];
}
