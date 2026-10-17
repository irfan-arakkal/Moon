// Thin client for the Moon REST API (shared/api.ts). Every call made on behalf of a
// tool carries X-MCP-Tool so the API records it in the activity feed.

import type { ClientSummary, ValidationResult, Workflow, WorkflowEdge, WorkflowNode } from '@moon/shared';

export class ApiCallError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class MoonApi {
  private readonly base: string;
  private readonly key: string | undefined;

  constructor(baseUrl: string, apiKey: string | undefined) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.key = apiKey;
  }

  private async call<T>(method: string, path: string, opts: { body?: unknown; tool?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.key) headers.authorization = `Bearer ${this.key}`;
    if (opts.tool) headers['x-mcp-tool'] = opts.tool;
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    } catch (err) {
      throw new ApiCallError(0, `API Moon injoignable (${this.base}) : ${(err as Error).message}`);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiCallError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  listClients = () => this.call<ClientSummary[]>('GET', '/clients');
  getWorkflow = (id: string) => this.call<Workflow>('GET', `/workflows/${encodeURIComponent(id)}`);
  validate = (id: string) => this.call<ValidationResult>('GET', `/workflows/${encodeURIComponent(id)}/validate`);

  createClient = (body: unknown, tool: string) => this.call<ClientSummary>('POST', '/clients', { body, tool });
  setScreenpipeStatus = (client: string, body: unknown, tool: string) =>
    this.call<ClientSummary>('POST', `/clients/${encodeURIComponent(client)}/screenpipe-status`, { body, tool });
  createWorkflow = (body: unknown, tool: string) => this.call<Workflow>('POST', '/workflows', { body, tool });
  addNode = (wf: string, body: unknown, tool: string) => this.call<WorkflowNode>('POST', `/workflows/${encodeURIComponent(wf)}/nodes`, { body, tool });
  updateNode = (wf: string, node: string, body: unknown, tool: string) =>
    this.call<WorkflowNode>('PATCH', `/workflows/${encodeURIComponent(wf)}/nodes/${encodeURIComponent(node)}`, { body, tool });
  removeNode = (wf: string, node: string, tool: string) =>
    this.call<{ removed: string; removedEdges: number }>('DELETE', `/workflows/${encodeURIComponent(wf)}/nodes/${encodeURIComponent(node)}`, { tool });
  connectNodes = (wf: string, body: unknown, tool: string) => this.call<WorkflowEdge>('POST', `/workflows/${encodeURIComponent(wf)}/edges`, { body, tool });
  patchWorkflow = (wf: string, body: unknown, tool: string) => this.call<Workflow>('PATCH', `/workflows/${encodeURIComponent(wf)}`, { body, tool });

  logActivity = (body: { workflowId?: string | null; tool: string; summary: string; status: 'success' | 'error' }) =>
    this.call('POST', '/activity', { body });
  registerTools = (tools: { name: string; description: string }[]) => this.call('PUT', '/mcp/tools', { body: { tools } });
}
