// Small stroke icons for the graph (paths adapted from Lucide, ISC licence). No icon dependency.

import type { WorkflowNode } from '@moon/shared';

const PATHS: Record<string, string[]> = {
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 6-10 7L2 6'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v5h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  table: ['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18', 'M15 3v18'],
  branch: ['M3 12h6', 'M9 12c4 0 5-6 12-6', 'M9 12c4 0 5 6 12 6'],
  check: ['M3 3h18v18H3z', 'm8 12 3 3 5-6'],
  send: ['m22 2-7 20-4-9-9-4z', 'M22 2 11 13'],
  bank: ['M3 21h18', 'M5 21V10', 'M19 21V10', 'M9 21V10', 'M15 21V10', 'M2 10 12 3l10 7z'],
  globe: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  dot: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(PATHS[name] ?? PATHS.dot).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// Icon + colour for a step, from its type, app and title.
export function stepIcon(node: WorkflowNode): { name: string; color: string } {
  const app = node.app ?? '';
  const title = node.title;
  if (node.type === 'condition') return { name: 'branch', color: '#e8b04b' };
  if (/gmail|mail|outlook/i.test(app)) {
    return /relance|envo|répon|send|reply/i.test(title) && node.type !== 'trigger' ? { name: 'send', color: '#f2876b' } : { name: 'mail', color: '#f2876b' };
  }
  if (/pdf|acrobat|preview|aperçu/i.test(app)) return { name: 'file', color: '#e889b0' };
  if (/excel|sheets|tableur|calc|spreadsheet/i.test(app)) {
    return /marqu|coch|rapproch|valid/i.test(title) ? { name: 'check', color: '#4fc78b' } : { name: 'table', color: '#4fc78b' };
  }
  if (/banque|bank|relevé/i.test(app)) return { name: 'bank', color: '#e8b04b' };
  if (/chrome|firefox|safari|edge|browser|navigateur/i.test(app)) return { name: 'globe', color: '#7aa7f2' };
  return { name: 'dot', color: '#a1a1aa' };
}
