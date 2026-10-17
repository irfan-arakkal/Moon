// Visual identity of the application a step happens in (lettermark + colour).
// Based on the app name reported in the node; unknown apps get a neutral badge.

export interface AppStyle {
  label: string;
  mark: string;
  color: string;
}

const KNOWN: [RegExp, AppStyle][] = [
  [/gmail/i, { label: 'Gmail', mark: 'M', color: '#ea4335' }],
  [/outlook|mail/i, { label: 'Mail', mark: '✉', color: '#2f7bf5' }],
  [/pdf|acrobat|preview|aperçu/i, { label: 'PDF', mark: 'PDF', color: '#e5484d' }],
  [/excel/i, { label: 'Excel', mark: 'X', color: '#1f9d55' }],
  [/sheets|tableur|calc|spreadsheet/i, { label: 'Tableur', mark: '▦', color: '#22a35a' }],
  [/banque|bank|relevé/i, { label: 'Banque', mark: '€', color: '#d4a72c' }],
  [/chrome|firefox|safari|edge|browser|navigateur/i, { label: 'Navigateur', mark: '◎', color: '#4c8df6' }],
  [/slack/i, { label: 'Slack', mark: '#', color: '#9b59b6' }],
  [/notion/i, { label: 'Notion', mark: 'N', color: '#d6d6e0' }],
  [/word|docs/i, { label: 'Document', mark: 'W', color: '#2b6cd8' }],
  [/pennylane|sage|cegid|quickbooks|compta/i, { label: 'Compta', mark: '₵', color: '#14b8a6' }],
];

export function appStyle(app: string | null): AppStyle {
  if (!app) return { label: '—', mark: '•', color: '#8e8e96' };
  for (const [re, style] of KNOWN) if (re.test(app)) return { ...style, label: app };
  return { label: app, mark: app.trim().charAt(0).toUpperCase() || '•', color: '#b7bdc9' };
}
