// REST contract (CLAUDE.md §13). Request/response bodies of the routes in web/server.
// Write routes need `Authorization: Bearer <API_KEY>`.
// Add the header `X-MCP-Tool: <tool name>` on calls made by MCP B: the call is then
// recorded as an ActivityEvent (shown in the "Logs" feed), success or error.

import type {
  Client,
  NodeOrigin,
  NodeType,
  Observation,
  SourceMode,
  Workflow,
  WorkflowStatus,
} from './types.ts';

export interface ClientSummary extends Client {
  workflows: { id: string; name: string; status: WorkflowStatus; sourceMode: SourceMode; isTestData: boolean }[];
}

// POST /api/clients
export interface CreateClientBody {
  name: string;
  isExample?: boolean;
}

// POST /api/clients/:id/screenpipe-status
export interface ScreenpipeStatusBody {
  status: 'connected' | 'disconnected';
  /** ISO timestamp of the last capture seen by Screenpipe. */
  lastSeenAt?: string | null;
}

// POST /api/workflows
export interface CreateWorkflowBody {
  clientId: string;
  name: string;
  description?: string;
  sourceMode: SourceMode;
  status?: WorkflowStatus;
  uncertainties?: string[];
}

// PATCH /api/workflows/:id
export interface UpdateWorkflowBody {
  clientId?: string; // if given, must match the workflow's client
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  uncertainties?: string[];
}

// POST /api/workflows/:id/nodes
export interface AddNodeBody {
  clientId?: string;
  /** Optional caller-chosen id (unique within the workflow); generated otherwise. */
  id?: string;
  type: NodeType;
  title: string;
  description?: string;
  app?: string | null;
  origin: NodeOrigin;
  observations?: Observation[];
  position?: { x: number; y: number } | null;
}

// PATCH /api/workflows/:id/nodes/:nodeId
export type UpdateNodeBody = Partial<Omit<AddNodeBody, 'id'>>;

// POST /api/workflows/:id/edges
export interface ConnectNodesBody {
  clientId?: string;
  source: string;
  target: string;
  label?: string | null;
}

// POST /api/activity — log an MCP call that does not go through a write route
// (e.g. get_workflow, validate_workflow).
export interface LogActivityBody {
  workflowId?: string | null;
  tool: string;
  summary: string;
  status: 'success' | 'error';
}

// PUT /api/mcp/tools — MCP B registers the tools it really exposes.
export interface RegisterToolsBody {
  tools: { name: string; description: string }[];
}

// GET /api/workflows/:id/validate
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApiError {
  error: string;
}

export type { Workflow };
