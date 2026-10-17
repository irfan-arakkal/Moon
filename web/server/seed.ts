// Test data, inserted only into an empty database. Everything here is flagged
// isTestData / isExample so the UI labels it "Données de test" — it never comes from Screenpipe.

import type { Store } from './db.ts';

export function seedTestData(store: Store) {
  const client = store.createClient('Cabinet Dupont (test)', true);
  const wf = store.createWorkflow({
    clientId: client.id,
    name: 'Saisie des factures fournisseurs',
    description: 'Workflow de test pour développer l’interface en attendant MCP B. Données fictives.',
    sourceMode: 'manual',
    status: 'ready',
    uncertainties: ['Données de test : aucune observation Screenpipe réelle.'],
    isTestData: true,
  });
  const t = (min: number) => new Date(Date.UTC(2026, 9, 17, 9, min)).toISOString();
  const add = (id: string, type: 'trigger' | 'action' | 'condition' | 'end', title: string, description: string, app: string | null, origin: 'observed' | 'inferred', obs: [string, number][] = []) =>
    store.addNode(wf.id, {
      id,
      type,
      title,
      description,
      app,
      origin,
      position: null,
      observations: obs.map(([text, min]) => ({ text: `[test] ${text}`, app: app ?? 'inconnu', timestamp: t(min) })),
    });

  add('mail', 'trigger', 'Mail client reçu', 'Facture fournisseur en pièce jointe (PDF)', 'Gmail', 'observed', [['Objet : Facture fournisseur octobre', 1]]);
  add('pdf', 'action', 'Lire la facture', 'Montant, date, fournisseur', 'PDF', 'observed', [['Facture n° F-2026-118 — Total TTC 1 240,00 €', 2]]);
  add('sheet', 'action', 'Saisie dans le tableur', 'Recopie des champs de la facture', 'Excel', 'observed', [['Ligne ajoutée : F-2026-118 | 1 240,00 €', 4]]);
  add('bank', 'condition', 'Paiement trouvé ?', 'Vérification dans le relevé bancaire', 'Banque', 'observed', [['Recherche « 1 240,00 » dans le relevé', 6]]);
  add('done', 'end', 'Marquer comme rapprochée', 'Hypothèse : la facture est cochée dans le tableur', 'Excel', 'inferred');
  add('relance', 'action', 'Mail de relance', 'Demande de la pièce manquante au client', 'Gmail', 'observed', [['Brouillon : « Pourriez-vous nous transmettre… »', 8]]);

  store.connectNodes(wf.id, 'mail', 'pdf', null);
  store.connectNodes(wf.id, 'pdf', 'sheet', null);
  store.connectNodes(wf.id, 'sheet', 'bank', null);
  store.connectNodes(wf.id, 'bank', 'done', 'true');
  store.connectNodes(wf.id, 'bank', 'relance', 'false');
  return wf;
}
