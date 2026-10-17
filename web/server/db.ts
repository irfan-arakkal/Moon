// Persistence layer. SQLite via Node's built-in `node:sqlite` (no native dependency).
// Every read/write of the workflow model goes through this module, so the canvas and
// MCP B always see the same nodes/edges (CLAUDE.md §8).

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  ActivityEvent,
  Client,
  ClientSummary,
  McpToolInfo,
  Observation,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from '@moon/shared';

type Row = Record<string, unknown>;

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      screenpipe_status TEXT NOT NULL DEFAULT 'unknown',
      screenpipe_last_seen_at TEXT,
      is_example INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      source_mode TEXT NOT NULL,
      is_test_data INTEGER NOT NULL DEFAULT 0,
      uncertainties TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nodes (
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      app TEXT,
      position TEXT,
      origin TEXT NOT NULL,
      observations TEXT NOT NULL DEFAULT '[]',
      seq INTEGER NOT NULL,
      PRIMARY KEY (workflow_id, id)
    );
    CREATE TABLE IF NOT EXISTS edges (
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      label TEXT,
      seq INTEGER NOT NULL,
      PRIMARY KEY (workflow_id, id)
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      workflow_id TEXT,
      tool TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_tools (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL
    );
  `);
  return new Store(db);
}

export class Store {
  constructor(private db: DatabaseSync) {}

  // Runs fn atomically.
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ---------- clients ----------

  createClient(name: string, isExample = false): Client {
    const id = newId('cli');
    this.db.prepare('INSERT INTO clients (id, name, is_example) VALUES (?, ?, ?)').run(id, name, isExample ? 1 : 0);
    return this.getClient(id);
  }

  getClient(id: string): Client {
    const row = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new NotFoundError(`client ${id} introuvable`);
    const ids = this.db.prepare('SELECT id FROM workflows WHERE client_id = ? ORDER BY created_at').all(id) as Row[];
    return {
      id: row.id as string,
      name: row.name as string,
      screenpipeStatus: row.screenpipe_status as Client['screenpipeStatus'],
      screenpipeLastSeenAt: (row.screenpipe_last_seen_at as string | null) ?? null,
      isExample: row.is_example === 1,
      workflowIds: ids.map((r) => r.id as string),
    };
  }

  listClients(): ClientSummary[] {
    const rows = this.db.prepare('SELECT id FROM clients ORDER BY is_example, name').all() as Row[];
    const wfStmt = this.db.prepare(
      'SELECT id, name, status, source_mode, is_test_data FROM workflows WHERE client_id = ? ORDER BY created_at',
    );
    return rows.map((r) => {
      const client = this.getClient(r.id as string);
      const workflows = (wfStmt.all(client.id) as Row[]).map((w) => ({
        id: w.id as string,
        name: w.name as string,
        status: w.status as Workflow['status'],
        sourceMode: w.source_mode as Workflow['sourceMode'],
        isTestData: w.is_test_data === 1,
      }));
      return { ...client, workflows };
    });
  }

  setScreenpipeStatus(id: string, status: 'connected' | 'disconnected', lastSeenAt: string | null): Client {
    this.getClient(id);
    this.db
      .prepare('UPDATE clients SET screenpipe_status = ?, screenpipe_last_seen_at = ? WHERE id = ?')
      .run(status, lastSeenAt, id);
    return this.getClient(id);
  }

  // ---------- workflows ----------

  createWorkflow(input: {
    clientId: string;
    name: string;
    description: string;
    sourceMode: Workflow['sourceMode'];
    status: Workflow['status'];
    uncertainties: string[];
    isTestData?: boolean;
  }): Workflow {
    this.getClient(input.clientId);
    const id = newId('wf');
    const t = now();
    this.db
      .prepare(
        `INSERT INTO workflows (id, client_id, name, description, status, source_mode, is_test_data, uncertainties, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.clientId,
        input.name,
        input.description,
        input.status,
        input.sourceMode,
        input.isTestData ? 1 : 0,
        JSON.stringify(input.uncertainties),
        t,
        t,
      );
    return this.getWorkflow(id);
  }

  getWorkflow(id: string): Workflow {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new NotFoundError(`workflow ${id} introuvable`);
    const nodes = (this.db.prepare('SELECT * FROM nodes WHERE workflow_id = ? ORDER BY seq').all(id) as Row[]).map(
      toNode,
    );
    const edges = (this.db.prepare('SELECT * FROM edges WHERE workflow_id = ? ORDER BY seq').all(id) as Row[]).map(
      toEdge,
    );
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      name: row.name as string,
      description: row.description as string,
      status: row.status as Workflow['status'],
      sourceMode: row.source_mode as Workflow['sourceMode'],
      isTestData: row.is_test_data === 1,
      uncertainties: JSON.parse(row.uncertainties as string),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      nodes,
      edges,
    };
  }

  updateWorkflow(
    id: string,
    patch: { name?: string; description?: string; status?: Workflow['status']; uncertainties?: string[] },
  ): Workflow {
    const wf = this.getWorkflow(id);
    this.db
      .prepare('UPDATE workflows SET name = ?, description = ?, status = ?, uncertainties = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.name ?? wf.name,
        patch.description ?? wf.description,
        patch.status ?? wf.status,
        JSON.stringify(patch.uncertainties ?? wf.uncertainties),
        now(),
        id,
      );
    return this.getWorkflow(id);
  }

  private touch(workflowId: string) {
    this.db.prepare('UPDATE workflows SET updated_at = ? WHERE id = ?').run(now(), workflowId);
  }

  // ---------- nodes ----------

  addNode(workflowId: string, input: Omit<WorkflowNode, 'workflowId' | 'id'> & { id?: string }): WorkflowNode {
    this.getWorkflow(workflowId);
    const id = input.id ?? newId('n');
    if (this.findNode(workflowId, id)) throw new ConflictError(`le node ${id} existe déjà`);
    const seq = this.nextSeq('nodes', workflowId);
    this.db
      .prepare(
        `INSERT INTO nodes (workflow_id, id, type, title, description, app, position, origin, observations, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workflowId,
        id,
        input.type,
        input.title,
        input.description,
        input.app,
        input.position ? JSON.stringify(input.position) : null,
        input.origin,
        JSON.stringify(input.observations),
        seq,
      );
    this.touch(workflowId);
    return this.findNode(workflowId, id)!;
  }

  updateNode(workflowId: string, nodeId: string, patch: Partial<Omit<WorkflowNode, 'id' | 'workflowId'>>): WorkflowNode {
    const node = this.findNode(workflowId, nodeId);
    if (!node) throw new NotFoundError(`node ${nodeId} introuvable dans ${workflowId}`);
    const next = { ...node, ...stripUndefined(patch) };
    this.db
      .prepare(
        `UPDATE nodes SET type = ?, title = ?, description = ?, app = ?, position = ?, origin = ?, observations = ?
         WHERE workflow_id = ? AND id = ?`,
      )
      .run(
        next.type,
        next.title,
        next.description,
        next.app,
        next.position ? JSON.stringify(next.position) : null,
        next.origin,
        JSON.stringify(next.observations),
        workflowId,
        nodeId,
      );
    this.touch(workflowId);
    return this.findNode(workflowId, nodeId)!;
  }

  /** Removes the node and every edge touching it. Returns the number of edges removed. */
  removeNode(workflowId: string, nodeId: string): { removedEdges: number } {
    if (!this.findNode(workflowId, nodeId)) throw new NotFoundError(`node ${nodeId} introuvable dans ${workflowId}`);
    const res = this.db
      .prepare('DELETE FROM edges WHERE workflow_id = ? AND (source = ? OR target = ?)')
      .run(workflowId, nodeId, nodeId);
    this.db.prepare('DELETE FROM nodes WHERE workflow_id = ? AND id = ?').run(workflowId, nodeId);
    this.touch(workflowId);
    return { removedEdges: Number(res.changes) };
  }

  findNode(workflowId: string, nodeId: string): WorkflowNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE workflow_id = ? AND id = ?').get(workflowId, nodeId) as
      | Row
      | undefined;
    return row ? toNode(row) : null;
  }

  // ---------- edges ----------

  connectNodes(workflowId: string, source: string, target: string, label: string | null): WorkflowEdge {
    this.getWorkflow(workflowId);
    if (!this.findNode(workflowId, source)) throw new NotFoundError(`node source ${source} introuvable`);
    if (!this.findNode(workflowId, target)) throw new NotFoundError(`node cible ${target} introuvable`);
    if (source === target) throw new ConflictError('un node ne peut pas être relié à lui-même');
    const dup = this.db
      .prepare('SELECT id FROM edges WHERE workflow_id = ? AND source = ? AND target = ?')
      .get(workflowId, source, target);
    if (dup) throw new ConflictError(`une connexion ${source} → ${target} existe déjà`);
    const id = newId('e');
    this.db
      .prepare('INSERT INTO edges (workflow_id, id, source, target, label, seq) VALUES (?, ?, ?, ?, ?, ?)')
      .run(workflowId, id, source, target, label, this.nextSeq('edges', workflowId));
    this.touch(workflowId);
    const row = this.db.prepare('SELECT * FROM edges WHERE workflow_id = ? AND id = ?').get(workflowId, id) as Row;
    return toEdge(row);
  }

  removeEdge(workflowId: string, edgeId: string) {
    const res = this.db.prepare('DELETE FROM edges WHERE workflow_id = ? AND id = ?').run(workflowId, edgeId);
    if (Number(res.changes) === 0) throw new NotFoundError(`connexion ${edgeId} introuvable dans ${workflowId}`);
    this.touch(workflowId);
  }

  private nextSeq(table: 'nodes' | 'edges', workflowId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM ${table} WHERE workflow_id = ?`).get(
      workflowId,
    ) as Row;
    return Number(row.s);
  }

  // ---------- activity ----------

  logActivity(input: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent {
    const event: ActivityEvent = { id: newId('act'), timestamp: now(), ...input };
    this.db
      .prepare('INSERT INTO activity (id, workflow_id, tool, summary, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
      .run(event.id, event.workflowId, event.tool, event.summary, event.status, event.timestamp);
    return event;
  }

  listActivity(workflowId: string, limit = 200): ActivityEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM activity WHERE workflow_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?')
      .all(workflowId, limit) as Row[];
    return rows.map((r) => ({
      id: r.id as string,
      workflowId: r.workflow_id as string | null,
      tool: r.tool as string,
      summary: r.summary as string,
      status: r.status as ActivityEvent['status'],
      timestamp: r.timestamp as string,
    }));
  }

  // ---------- MCP tool registry ----------

  setMcpTools(tools: McpToolInfo[]) {
    this.tx(() => {
      this.db.exec('DELETE FROM mcp_tools');
      const stmt = this.db.prepare('INSERT INTO mcp_tools (name, description) VALUES (?, ?)');
      for (const t of tools) stmt.run(t.name, t.description);
    });
  }

  listMcpTools(): McpToolInfo[] {
    return (this.db.prepare('SELECT name, description FROM mcp_tools ORDER BY name').all() as Row[]).map((r) => ({
      name: r.name as string,
      description: r.description as string,
    }));
  }

  isEmpty(): boolean {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM clients').get() as Row).c === 0;
  }
}

function toNode(row: Row): WorkflowNode {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    type: row.type as WorkflowNode['type'],
    title: row.title as string,
    description: row.description as string,
    app: (row.app as string | null) ?? null,
    position: row.position ? JSON.parse(row.position as string) : null,
    origin: row.origin as WorkflowNode['origin'],
    observations: JSON.parse(row.observations as string) as Observation[],
  };
}

function toEdge(row: Row): WorkflowEdge {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    source: row.source as string,
    target: row.target as string,
    label: (row.label as string | null) ?? null,
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
