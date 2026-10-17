// Shared data model (CLAUDE.md §8). Used by web/ (API + front) and mcp/ (MCP B).
// Do not change without telling the other person: both sides depend on it.

/** Where the workflow's data comes from. Drives the source badge in the UI. */
export type SourceMode =
  | 'screenpipe_live' // analysed from live Screenpipe data
  | 'screenpipe_recorded' // analysed from a recorded/frozen Screenpipe session
  | 'manual'; // created by hand or example data

/** observed = present in Screenpipe results; inferred = deduced by the model. */
export type NodeOrigin = 'observed' | 'inferred';

/** Lifecycle of the analysis that produced the workflow. */
export type WorkflowStatus = 'draft' | 'analyzing' | 'ready' | 'error';

export type NodeType = 'trigger' | 'action' | 'condition' | 'end';

export type ScreenpipeStatus = 'connected' | 'disconnected' | 'unknown';

/** One piece of evidence taken from Screenpipe search results. */
export interface Observation {
  text: string;
  /** Application name as reported by Screenpipe (e.g. "Gmail", "Excel"). */
  app: string;
  /** ISO 8601 timestamp of the capture. */
  timestamp: string;
  windowName?: string;
}

export interface Client {
  id: string;
  name: string;
  /** Last status reported to the API (see POST /api/clients/:id/screenpipe-status). */
  screenpipeStatus: ScreenpipeStatus;
  /** ISO timestamp of the last Screenpipe activity reported, or null. */
  screenpipeLastSeenAt: string | null;
  /** Decorative/demo client: the UI shows an "exemple" badge. */
  isExample: boolean;
  workflowIds: string[];
}

export interface WorkflowNode {
  id: string;
  workflowId: string;
  type: NodeType;
  title: string;
  description: string;
  /** Application the step happens in (Gmail, PDF, Excel…), or null. */
  app: string | null;
  /** Canvas position; null lets the front compute an automatic layout. */
  position: { x: number; y: number } | null;
  origin: NodeOrigin;
  observations: Observation[];
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  source: string;
  target: string;
  /** Condition label, e.g. "true" / "false", or null. */
  label: string | null;
}

export interface Workflow {
  id: string;
  clientId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  sourceMode: SourceMode;
  /** Test/sample data inserted by the app (not produced by Claude). UI shows "Données de test". */
  isTestData: boolean;
  /** Uncertainties reported by the analysis (CLAUDE.md §7). */
  uncertainties: string[];
  createdAt: string;
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ActivityEvent {
  id: string;
  workflowId: string | null;
  /** MCP tool name, e.g. "add_node". */
  tool: string;
  summary: string;
  status: 'success' | 'error';
  timestamp: string;
}

/** A tool exposed by MCP B, as registered by the MCP server itself. */
export interface McpToolInfo {
  name: string;
  description: string;
}
