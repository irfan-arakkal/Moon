// I9: status badges. Every label below must be true for the data shown (CLAUDE.md §2, §9.5).

import type { Workflow, WorkflowNode } from '@moon/shared';

export function SourceBadge({ workflow }: { workflow: Workflow }) {
  if (workflow.isTestData)
    return (
      <span className="badge badge-test" title="Données insérées par l’application pour le développement, pas produites par Claude ni Screenpipe">
        Données de test
      </span>
    );
  switch (workflow.sourceMode) {
    case 'screenpipe_live':
      return (
        <span className="badge badge-live" title="Généré par Claude à partir de résultats Screenpipe réels">
          ✦ Workflow généré par l’IA · Basé sur l’activité réelle du client
        </span>
      );
    case 'screenpipe_recorded':
      return (
        <span className="badge badge-recorded" title="Analyse d’une session Screenpipe enregistrée à l’avance (scénario joué, données fictives)">
          ● Session enregistrée Screenpipe
        </span>
      );
    default:
      return (
        <span className="badge badge-manual" title="Workflow créé à la main ou exemple">
          Données d’exemple
        </span>
      );
  }
}

const STATUS: Record<Workflow['status'], { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'badge-manual' },
  analyzing: { label: 'Analyse en cours…', cls: 'badge-analyzing' },
  ready: { label: 'Résultat', cls: 'badge-ok' },
  error: { label: 'Erreur d’analyse', cls: 'badge-error' },
};

export function StatusBadge({ status }: { status: Workflow['status'] }) {
  const s = STATUS[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function OriginBadge({ node }: { node: WorkflowNode }) {
  if (node.origin === 'observed' && node.observations.length === 0)
    return <span className="badge badge-error" title="Marquée observée mais aucune observation Screenpipe ne l’appuie">Observée sans preuve</span>;
  return node.origin === 'observed' ? (
    <span className="badge badge-observed" title="Présente dans les résultats Screenpipe">Observée</span>
  ) : (
    <span className="badge badge-inferred" title="Déduite par le modèle, pas vue directement">Inférée</span>
  );
}
