// Right panel "Claude": provenance of the selected step + the real MCP calls Claude made on
// this workflow (activity feed). Nothing here is simulated: every line comes from the API.

import type { ActivityEvent, Workflow, WorkflowNode } from '@moon/shared';
import { fmtTime, timeAgo } from '../api.ts';
import { Provenance } from './Panels.tsx';

interface Props {
  workflow: Workflow;
  node: WorkflowNode | null;
  onCloseNode: () => void;
  events: ActivityEvent[] | null;
  eventsError: string | null;
  now: number;
  onCollapse: () => void;
  children?: React.ReactNode; // composer, when available
}

export function ClaudePanel({ workflow, node, onCloseNode, events, eventsError, now, onCollapse, children }: Props) {
  const sorted = [...(events ?? [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return (
    <aside className="claude">
      <header className="claude-head">
        <span className="strong">Claude</span>
        <span className="muted small">· Provenance des étapes</span>
        <span className="grow" />
        <button className="icon-btn" onClick={onCollapse} title="Masquer le panneau" aria-label="Masquer le panneau">
          »
        </button>
      </header>

      <div className="claude-body">
        {node ? (
          <Provenance workflow={workflow} node={node} onClose={onCloseNode} />
        ) : (
          <p className="muted small claude-hint">Cliquez sur une étape du graphe pour voir d’où elle vient : observations Screenpipe ou déduction de Claude.</p>
        )}

        <div className="claude-section">Appels MCP de Claude</div>
        {eventsError && <div className="notice error">Impossible de lire l’activité : {eventsError}</div>}
        {events && sorted.length === 0 && <p className="muted small">Aucun appel reçu pour ce workflow. Les appels de Claude via MCP B s’affichent ici en direct.</p>}
        <ul className="claude-log">
          {sorted.map((e) => (
            <li key={e.id} title={timeAgo(e.timestamp, now)}>
              <span className={`log-dot ${e.status}`} />
              <span className="log-main">
                <code>{e.tool}</code> <span className="muted">· {e.summary}</span>
              </span>
              <span className="log-time">{fmtTime(e.timestamp)}</span>
            </li>
          ))}
        </ul>
      </div>

      {children}
    </aside>
  );
}
