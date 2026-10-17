// I10: sidebar — clients and workflows (counts from the database), Screenpipe status.

import { useEffect, useState } from 'react';
import type { ClientSummary } from '@moon/shared';
import { timeAgo } from '../api.ts';

interface Props {
  clients: ClientSummary[] | null;
  error: string | null;
  selectedWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
}

export function Sidebar({ clients, error, selectedWorkflowId, onSelectWorkflow }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();
  const visible = (clients ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.workflows.some((w) => w.name.toLowerCase().includes(q)),
  );
  const activeClient = clients?.find((c) => c.workflows.some((w) => w.id === selectedWorkflowId));

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo-tile" aria-hidden><div className="moon" /></div>
        <div>
          <div className="brand-name">Moon</div>
          <div className="muted tiny">Trouver quoi automatiser</div>
        </div>
      </div>

      <input className="search" placeholder="Rechercher un client…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="section-label">Clients</div>
      <nav className="clients">
        {error && <div className="notice error">API injoignable : {error}</div>}
        {clients && clients.length === 0 && <p className="muted small">Aucun client. Claude en créera un via MCP B.</p>}
        {visible.map((c) => {
          const isOpen = open[c.id] ?? (c.id === activeClient?.id || !!q);
          return (
            <div key={c.id} className={`client ${c.id === activeClient?.id ? 'active' : ''}`}>
              <button className="client-head" onClick={() => setOpen({ ...open, [c.id]: !isOpen })}>
                <span className="client-avatar">{c.name.charAt(0).toUpperCase()}</span>
                <span className="grow">
                  <span className="client-name">
                    {c.name} {c.isExample && <span className="badge badge-test tiny">exemple</span>}
                  </span>
                  <span className="muted tiny">
                    {c.workflows.length} workflow{c.workflows.length > 1 ? 's' : ''}
                  </span>
                </span>
                <span className={`chev ${isOpen ? 'open' : ''}`}>›</span>
              </button>
              {isOpen && (
                <ul className="wf-list">
                  {c.workflows.map((w) => (
                    <li key={w.id}>
                      <button className={`wf ${w.id === selectedWorkflowId ? 'selected' : ''}`} onClick={() => onSelectWorkflow(w.id)}>
                        <span className={`wf-dot ${w.status}`} />
                        <span className="grow">{w.name}</span>
                        {w.isTestData && <span className="badge badge-test tiny">test</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}

// ---------- Screenpipe status ----------
// Two real sources, shown with their origin:
//  1. this browser calls http://localhost:3030/health (works when the page is opened on the
//     machine running Screenpipe and the browser allows it);
//  2. otherwise, the last status reported to the API for the client (POST /api/clients/:id/screenpipe-status).
// Shown in the header only when one of them confirms the connection; otherwise nothing.
// Never a hard-coded "connecté".

type LocalCheck = { ok: boolean; lastFrame: string | null } | null;

function useLocalScreenpipe(): LocalCheck {
  const [state, setState] = useState<LocalCheck>(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('http://localhost:3030/health', { signal: AbortSignal.timeout(2500) });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        // Field names are read defensively: the /health schema is not part of our contract.
        const lastFrame = typeof body.last_frame_timestamp === 'string' ? body.last_frame_timestamp : null;
        if (alive) setState({ ok: res.ok, lastFrame });
      } catch {
        if (alive) setState({ ok: false, lastFrame: null });
      }
    };
    check();
    const t = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return state;
}

const REPORT_FRESH_MS = 10 * 60 * 1000;

export function ScreenpipeStatus({ client, now }: { client: ClientSummary | null; now: number }) {
  const local = useLocalScreenpipe();
  let connected = false;
  let detail = 'non connecté';
  let source = 'Aucun signal de Screenpipe.';

  if (local?.ok) {
    connected = true;
    detail = local.lastFrame ? `Dernière activité : ${timeAgo(local.lastFrame, now)}` : 'Santé OK (localhost:3030)';
    source = 'Vérifié par ce navigateur via http://localhost:3030/health';
  } else if (client?.screenpipeStatus === 'connected' && client.screenpipeLastSeenAt) {
    const fresh = now - Date.parse(client.screenpipeLastSeenAt) < REPORT_FRESH_MS;
    connected = fresh;
    detail = `Dernière activité : ${timeAgo(client.screenpipeLastSeenAt, now)}`;
    source = fresh ? `Statut signalé à l’API pour ${client.name}` : `Dernier signal trop ancien (${client.name})`;
  } else if (local === null) {
    detail = 'vérification…';
  }

  if (!connected) return null;
  return (
    <span className="sp-chip" title={`${source} · ${detail}`}>
      <span className="status-dot on" />
      Screenpipe connecté
    </span>
  );
}
