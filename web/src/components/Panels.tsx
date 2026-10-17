// I8 provenance (floating card), "Outils MCP disponibles", Détails and Logs (I7 activity) tabs.

import type { ActivityEvent, McpToolInfo, ValidationResult, Workflow, WorkflowNode } from '@moon/shared';
import { fmtDateTime, fmtTime, timeAgo } from '../api.ts';
import { OriginBadge } from './Badges.tsx';
import { Icon, stepIcon } from './icons.tsx';

const TYPE_LABEL: Record<WorkflowNode['type'], string> = { trigger: 'déclencheur', action: 'action', condition: 'condition', end: 'fin' };

export function TestDataNotice({ workflow }: { workflow: Workflow }) {
  if (!workflow.isTestData) return null;
  return <div className="notice">Données de test : ces observations sont fictives et ne viennent pas de Screenpipe.</div>;
}

// ---------- I8: provenance of one node ----------

export function Provenance({ workflow, node, onClose }: { workflow: Workflow; node: WorkflowNode; onClose: () => void }) {
  const icon = stepIcon(node);
  const incoming = workflow.edges.filter((e) => e.target === node.id);
  const outgoing = workflow.edges.filter((e) => e.source === node.id);
  const title = (id: string) => workflow.nodes.find((n) => n.id === id)?.title ?? id;
  return (
    <section className="card provenance">
      <header className="card-head">
        <span className="step-icon" style={{ color: icon.color, borderColor: 'var(--border-strong)', background: 'var(--tile)' }}>
          <Icon name={icon.name} size={16} />
        </span>
        <div className="grow">
          <div className="muted small">Provenance de l’étape</div>
          <div className="strong">{node.title}</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className="row gap">
        <OriginBadge origin={node.origin} />
        {node.app && <span className="badge badge-manual">{node.app}</span>}
        <span className="badge badge-manual">{TYPE_LABEL[node.type]}</span>
      </div>
      {node.description && <p className="desc">{node.description}</p>}
      <TestDataNotice workflow={workflow} />
      <h4>Observations Screenpipe ({node.observations.length})</h4>
      {node.observations.length === 0 ? (
        <p className="muted small">
          {node.origin === 'inferred'
            ? 'Aucune observation : cette étape a été déduite par le modèle.'
            : 'Aucune observation enregistrée pour cette étape.'}
        </p>
      ) : (
        <ul className="obs-list">
          {node.observations.map((o, i) => (
            <li key={i}>
              <div className="obs-meta">
                <span>{o.app}</span>
                <span title={o.timestamp}>{fmtDateTime(o.timestamp)}</span>
              </div>
              {o.windowName && <div className="muted small">{o.windowName}</div>}
              <div className="obs-text">{o.text}</div>
            </li>
          ))}
        </ul>
      )}
      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="links small muted">
          {incoming.map((e) => (
            <div key={e.id}>← {title(e.source)}{e.label ? ` [${e.label}]` : ''}</div>
          ))}
          {outgoing.map((e) => (
            <div key={e.id}>→ {title(e.target)}{e.label ? ` [${e.label}]` : ''}</div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- "Outils MCP disponibles": the real list registered by MCP B ----------

export function McpTools({ tools, error }: { tools: McpToolInfo[] | null; error: string | null }) {
  return (
    <section className="card tools">
      <header className="card-head">
        <span className="grow strong">Outils MCP disponibles</span>
      </header>
      {error && <div className="notice error">{error}</div>}
      {tools && tools.length === 0 && (
        <p className="muted small">Aucun outil enregistré : le serveur MCP B ne s’est pas encore déclaré (PUT /api/mcp/tools).</p>
      )}
      <div className="tool-grid">
        {tools?.map((t) => (
          <span key={t.name} className="tool-chip" title={t.description || t.name}>
            {t.name}
          </span>
        ))}
      </div>
      {tools && tools.length > 0 && <p className="muted tiny">Liste lue depuis le serveur. Ces outils sont appelés par Claude, pas depuis cette page.</p>}
    </section>
  );
}

// ---------- Détails tab ----------

export function DetailsTab({ workflow, validation, onSelect }: { workflow: Workflow; validation: ValidationResult | null; onSelect: (id: string) => void }) {
  const observed = workflow.nodes.filter((n) => n.origin === 'observed').length;
  return (
    <div className="tab-scroll">
      <section className="card">
        <h3>{workflow.name}</h3>
        {workflow.description && <p className="desc">{workflow.description}</p>}
        <div className="row gap small muted">
          <span>{workflow.nodes.length} étapes</span>
          <span>{observed} observées</span>
          <span>{workflow.nodes.length - observed} inférées</span>
          <span>{workflow.edges.length} connexions</span>
          <span>Créé le {fmtDateTime(workflow.createdAt)}</span>
        </div>
        {validation && (
          <div className={`notice ${validation.valid ? 'ok' : 'warn'}`}>
            {validation.valid ? 'Structure valide.' : `Points à vérifier : ${validation.errors.join(' · ')}`}
          </div>
        )}
        {workflow.uncertainties.length > 0 && (
          <>
            <h4>Incertitudes signalées</h4>
            <ul className="plain">
              {workflow.uncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      <TestDataNotice workflow={workflow} />
      <table className="table">
        <thead>
          <tr>
            <th>Étape</th>
            <th>Application</th>
            <th>Origine</th>
            <th>Observations</th>
          </tr>
        </thead>
        <tbody>
          {workflow.nodes.map((n) => (
            <tr key={n.id} onClick={() => onSelect(n.id)} className="clickable">
              <td>
                <div className="strong">{n.title}</div>
                <div className="muted small">{n.description}</div>
              </td>
              <td>{n.app ?? '—'}</td>
              <td>
                <OriginBadge origin={n.origin} />
              </td>
              <td className="small">
                {n.observations.length === 0
                  ? '—'
                  : n.observations.map((o, i) => (
                      <div key={i}>
                        <span className="muted">{fmtTime(o.timestamp)} · {o.app} —</span> {o.text}
                      </div>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Logs tab ----------

export function LogsTab({ events, error, tools, toolsError, now }: {
  events: ActivityEvent[] | null;
  error: string | null;
  tools: McpToolInfo[] | null;
  toolsError: string | null;
  now: number;
}) {
  return (
    <div className="tab-scroll">
      <McpTools tools={tools} error={toolsError} />
      {error && <div className="notice error">Impossible de lire l’activité : {error}</div>}
      {!events && !error && <div className="empty">Chargement…</div>}
      {events && events.length === 0 && (
        <p className="muted small logs-empty">Aucun appel MCP reçu pour ce workflow. Les appels de Claude via MCP B apparaîtront ici en direct.</p>
      )}
      {events && events.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Heure</th>
              <th>Outil</th>
              <th>Résumé</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="small" title={timeAgo(e.timestamp, now)}>{fmtDateTime(e.timestamp)}</td>
                <td><code>{e.tool}</code></td>
                <td>{e.summary}</td>
                <td>
                  <span className={`badge ${e.status === 'success' ? 'badge-ok' : 'badge-error'}`}>{e.status === 'success' ? 'succès' : 'erreur'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
