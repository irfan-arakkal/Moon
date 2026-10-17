import { useEffect, useMemo, useState } from 'react';
import { api, fmtDateTime, timeAgo, useNow, usePolling } from './api.ts';
import { GraphView } from './components/GraphView.tsx';
import { SourceBadge, StatusBadge } from './components/Badges.tsx';
import { DetailsTab, LogsTab, Provenance } from './components/Panels.tsx';
import { ScreenpipeStatus, Sidebar } from './components/Sidebar.tsx';

const POLL_MS = 2000;
type Tab = 'graph' | 'details' | 'logs';

const readHash = () => /^#\/w\/(.+)$/.exec(location.hash)?.[1] ?? null;

export function App() {
  const now = useNow();
  const [workflowId, setWorkflowId] = useState<string | null>(readHash);
  const [tab, setTab] = useState<Tab>('graph');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setWorkflowId(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const clients = usePolling(api.clients, 5000, []);
  const tools = usePolling(api.mcpTools, 10000, []);

  // Default to the first workflow, preferring real data over test data.
  useEffect(() => {
    if (workflowId || !clients.data) return;
    const all = clients.data.flatMap((c) => c.workflows);
    const first = all.find((w) => !w.isTestData) ?? all[0];
    if (first) selectWorkflow(first.id);
  }, [clients.data, workflowId]);

  const selectWorkflow = (id: string) => {
    location.hash = `#/w/${id}`;
    setWorkflowId(id);
    setSelectedNode(null);
  };

  const workflow = usePolling(workflowId ? () => api.workflow(workflowId) : null, POLL_MS, [workflowId]);
  const activity = usePolling(workflowId ? () => api.activity(workflowId) : null, POLL_MS, [workflowId]);
  const validation = usePolling(workflowId ? () => api.validate(workflowId) : null, 5000, [workflowId]);

  const wf = workflow.data;
  const client = clients.data?.find((c) => c.id === wf?.clientId);
  const node = useMemo(() => wf?.nodes.find((n) => n.id === selectedNode) ?? null, [wf, selectedNode]);

  return (
    <div className="app">
      <div className="sky" aria-hidden />
      <Sidebar clients={clients.data} error={clients.error} selectedWorkflowId={workflowId} onSelectWorkflow={selectWorkflow} />

      <main className="main">
        {!workflowId && !clients.loading && <div className="empty">Aucun workflow pour l’instant.</div>}
        {workflowId && workflow.error && !wf && <div className="empty">Impossible de charger le workflow : {workflow.error}</div>}
        {wf && (
          <>
            <header className="header">
              <div className="grow">
                <div className="crumbs">
                  <span className="crumb-client">{client?.name ?? '…'}</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb-wf">{wf.name}</span>
                </div>
                <div className="row gap wrap">
                  <SourceBadge workflow={wf} />
                  <StatusBadge status={wf.status} />
                  <ScreenpipeStatus client={client ?? null} now={now} />
                  {workflow.error && <span className="badge badge-error">Rafraîchissement en échec</span>}
                </div>
              </div>
              <div className="updated" title={fmtDateTime(wf.updatedAt)}>
                <span className={`live-dot ${workflow.error ? 'off' : ''}`} />
                Dernière mise à jour : {timeAgo(wf.updatedAt, now)}
              </div>
            </header>

            <nav className="tabs">
              <button className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}>Vue Graph</button>
              <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Détails</button>
              <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>
                Logs {activity.data && activity.data.length > 0 && <span className="count">{activity.data.length}</span>}
              </button>
            </nav>

            <section className="canvas">
              {tab === 'graph' && <GraphView workflow={wf} selectedId={selectedNode} onSelect={setSelectedNode} />}
              {tab === 'details' && <DetailsTab workflow={wf} validation={validation.data} onSelect={(id) => { setSelectedNode(id); }} />}
              {tab === 'logs' && <LogsTab events={activity.data} error={activity.error} tools={tools.data} toolsError={tools.error} now={now} />}
              {node && tab !== 'logs' && (
                <div className="node-overlay">
                  <Provenance workflow={wf} node={node} onClose={() => setSelectedNode(null)} />
                </div>
              )}
            </section>
          </>
        )}
      </main>

    </div>
  );
}
