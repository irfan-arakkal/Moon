# Scénario de démo — documents fictifs (H2)

Tout ici est **fictif** (noms, montants, IBAN). Pendant la démo : « la capture Screenpipe
est réelle, les données jouées sont fictives ».

| Fichier | Étape du scénario (CLAUDE.md §10) |
|---|---|
| `emails.md` → Mail 1 | 1. Réception du mail client avec la facture PDF |
| `facture-F-2026-1042.pdf` | 2. Lecture : montant 1 240,80 € TTC, date 03/10/2026, fournisseur Papeterie Lumière |
| `saisie-achats.xlsx` (ligne 5 vide) | 3. Recopie dans le tableur |
| `releve-bancaire-octobre-2026.pdf` | 4. Vérification : **aucun** paiement à Papeterie Lumière → « Paiement trouvé ? = Non » |
| `emails.md` → Mail 2 | 5. Mail de relance pour justificatif manquant |

## Enregistrement (≈ 5 min)

1. Screenpipe tourne depuis au moins 5 minutes. Fermer les fenêtres privées.
2. Noter l'heure de début.
3. Jouer les 5 étapes **lentement** (≈ 40 s chacune), en laissant chaque document
   bien visible et lisible à l'écran : Screenpipe lit le texte affiché.
4. Noter l'heure de fin, puis dans Claude Code : `/analyse <début> <fin>`.
