// Client for the REST API (read-only) + polling hook (I6), and the in-app assistant.

import { useEffect, useRef, useState } from 'react';
import type { ActivityEvent, ClientSummary, McpToolInfo, ValidationResult, Workflow } from '@moon/shared';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  clients: () => get<ClientSummary[]>('/clients'),
  workflow: (id: string) => get<Workflow>(`/workflows/${encodeURIComponent(id)}`),
  activity: (id: string) => get<ActivityEvent[]>(`/workflows/${encodeURIComponent(id)}/activity`),
  validate: (id: string) => get<ValidationResult>(`/workflows/${encodeURIComponent(id)}/validate`),
  mcpTools: () => get<McpToolInfo[]>('/mcp/tools'),
  assistantStatus: () => get<AssistantStatus>('/assistant/status'),
};

export interface AssistantStatus {
  enabled: boolean;
  reason: string | null;
  needsCode: boolean;
  model: string;
}
export interface AssistantStep {
  tool: string;
  ok: boolean;
  summary: string;
}
export interface AssistantSource {
  url: string;
  title: string | null;
}
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function askAssistant(workflowId: string, messages: ChatTurn[], code: string | null): Promise<{ reply: string; steps: AssistantStep[]; sources: AssistantSource[] }> {
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(code ? { 'x-assistant-code': code } : {}) },
    body: JSON.stringify({ workflowId, messages }),
  });
  const body = (await res.json().catch(() => ({}))) as { reply?: string; steps?: AssistantStep[]; sources?: AssistantSource[]; error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status, steps: body.steps ?? [] });
  return { reply: body.reply ?? '', steps: body.steps ?? [], sources: body.sources ?? [] };
}

export interface Polled<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Re-fetches every `intervalMs`. Keeps the previous object when the JSON is unchanged,
 * so React Flow does not re-render (and lose the viewport) on every tick.
 */
export function usePolling<T>(fetcher: (() => Promise<T>) | null, intervalMs: number, deps: unknown[]): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ data: null, error: null, loading: true });
  const last = useRef<string>('');

  useEffect(() => {
    last.current = '';
    setState({ data: null, error: null, loading: !!fetcher });
    if (!fetcher) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const data = await fetcher();
        const json = JSON.stringify(data);
        if (alive && json !== last.current) {
          last.current = json;
          setState({ data, error: null, loading: false });
        } else if (alive) {
          setState((s) => (s.error || s.loading ? { ...s, error: null, loading: false } : s));
        }
      } catch (err) {
        if (alive) setState((s) => ({ ...s, error: (err as Error).message, loading: false }));
      }
      if (alive) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** "il y a 5 min" style relative time, re-rendered by the caller's clock. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
