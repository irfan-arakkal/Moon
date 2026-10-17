// I7 activity feed, I8 provenance, "Outils MCP disponibles", Détails and Logs tabs.

import type { ActivityEvent, McpToolInfo, ValidationResult, Workflow, WorkflowNode } from '@moon/shared';
import { appStyle } from '../apps.ts';
import { fmtDateTime, fmtTime, timeAgo } from '../api.ts';
import { OriginBadge } from './Badges.tsx';

export function TestDataNotice({ workflow }: { workflow: Workflow }) {
  if (!workflow.isTestData) return null;
  return <div className="notice">Données de test : ces observations sont fictives et ne viennent pas de Screenpipe.</div>;
}

// ---------- I8: provenance of one node ----------

export function Provenance({ workflow, node, onClose }: { workflow: Workflow; node: WorkflowNode; onClose: () => void }) {
  const app = appStyle(node.app);
  const incoming = workflow.edges.filter((e) => e.target === node.id);
  const outgoing = workflow.edges.filter((e) => e.source === node.id);
  const title = (id: string) => workflow.nodes.find((n) => n.id === id)?.title ?? id;
  return (
    <section className="card provenance">
      <header className="card-head">
        <span className="step-icon sm" style={{ background: `${app.color}22`, color: app.color, borderColor: `${app.color}55` }}>
          {app.mark}
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
        <span className="badge badge-manual">{node.type}</span>
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

// ---------- I7: live feed of MCP calls ----------

export function ActivityFeed({ events, error, now }: { events: ActivityEvent[] | null; error: string | null; now: number }) {
  return (
    <section className="card feed">
      <header className="card-head">
        <span className="grow strong">Activité MCP</span>
        <span className={`live-dot ${error ? 'off' : ''}`} title={error ? `Rafraîchissement en échec : ${error}` : 'Mise à jour toutes les 2 s'} />
      </header>
      {error && <div className="notice error">Impossible de lire l’activité : {error}</div>}
      {events && events.length === 0 && (
        <p className="muted small">Aucun appel MCP reçu pour ce workflow. Les appels de Claude via MCP B apparaîtront ici.</p>
      )}
      <ul className="feed-list">
        {events?.map((e) => (
          <li key={e.id} className={`feed-item ${e.status}`}>
            <div className="feed-top">
              <code>{e.tool}</code>
              <span className={`badge ${e.status === 'success' ? 'badge-ok' : 'badge-error'}`}>{e.status === 'success' ? 'succès' : 'erreur'}</span>
            </div>
            <div className="feed-summary">{e.summary}</div>
            <div className="muted small" title={e.timestamp}>
              {fmtTime(e.timestamp)} · {timeAgo(e.timestamp, now)}
            </div>
          </li>
        ))}
      </ul>
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

export function LogsTab({ events, now }: { events: ActivityEvent[] | null; now: number }) {
  if (!events) return <div className="empty">Chargement…</div>;
  if (events.length === 0) return <div className="empty">Aucun appel MCP enregistré pour ce workflow.</div>;
  return (
    <div className="tab-scroll">
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
    </div>
  );
}
