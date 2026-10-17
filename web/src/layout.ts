// Automatic left-to-right layout for nodes without a stored position.
// Column = longest path from a root; rows are centred in each column.

import type { WorkflowEdge, WorkflowNode } from '@moon/shared';

const COL = 250;
const ROW = 110;

export function layout(nodes: WorkflowNode[], edges: WorkflowEdge[]): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const d = Math.max(-1, ...(incoming.get(id) ?? []).map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };

  const columns = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depthOf(n.id);
    columns.set(d, [...(columns.get(d) ?? []), n.id]);
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [d, col] of columns) {
    col.forEach((id, i) => out.set(id, { x: d * COL, y: (i - (col.length - 1) / 2) * ROW }));
  }
  for (const n of nodes) if (n.position) out.set(n.id, n.position);
  return out;
}
