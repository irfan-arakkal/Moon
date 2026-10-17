// Chat with the in-app Claude assistant (server/assistant.ts). Disabled, with the reason shown,
// when the server has no Anthropic key: never a simulated conversation.

import { useEffect, useRef, useState } from 'react';
import { api, askAssistant, type AssistantSource, type AssistantStatus, type AssistantStep, type ChatTurn } from '../api.ts';

type Msg = ChatTurn & { steps?: AssistantStep[]; sources?: AssistantSource[]; error?: boolean };

const CODE_KEY = 'moon.assistantCode';
const readCode = () => {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
};
const saveCode = (v: string | null) => {
  try {
    if (v) localStorage.setItem(CODE_KEY, v);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* storage unavailable: the code is asked again next time */
  }
};

export function useAssistant(workflowId: string) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(readCode);

  useEffect(() => {
    api.assistantStatus().then(setStatus, (e: Error) => setStatusError(e.message));
  }, []);
  useEffect(() => setMessages([]), [workflowId]);

  const send = async (text: string) => {
    const history: Msg[] = [...messages.filter((m) => !m.error), { role: 'user', content: text }];
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const { reply, steps, sources } = await askAssistant(
        workflowId,
        history.map(({ role, content }) => ({ role, content })),
        code,
      );
      setMessages((m) => [...m, { role: 'assistant', content: reply, steps, sources }]);
    } catch (err) {
      const e = err as Error & { status?: number; steps?: AssistantStep[] };
      if (e.status === 401) {
        saveCode(null);
        setCode(null);
      }
      setMessages((m) => [...m, { role: 'assistant', content: e.message, steps: e.steps, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const setAccessCode = (v: string) => {
    saveCode(v);
    setCode(v);
  };

  return { status, statusError, messages, busy, code, send, setAccessCode };
}

export function ChatThread({ messages, busy }: { messages: Msg[]; busy: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages.length, busy]);
  if (messages.length === 0 && !busy) return null;
  return (
    <div className="chat">
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="chat-user">{m.content}</div>
        ) : (
          <div key={i} className={`chat-assistant ${m.error ? 'is-error' : ''}`}>
            {m.steps && m.steps.length > 0 && (
              <ul className="chat-steps">
                {m.steps.map((s, j) => (
                  <li key={j} title={s.summary}>
                    <span className={`log-dot ${s.ok ? 'success' : 'error'}`} />
                    <code>{s.tool}</code>
                    {!s.ok && <span className="muted"> · {s.summary}</span>}
                  </li>
                ))}
              </ul>
            )}
            {m.content.split(/\n{2,}/).map((p, j) => (
              <p key={j}>{p}</p>
            ))}
            {m.sources && m.sources.length > 0 && (
              <div className="chat-sources">
                <span className="muted tiny">Sources</span>
                {m.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.title || new URL(s.url).hostname}
                  </a>
                ))}
              </div>
            )}
          </div>
        ),
      )}
      {busy && <div className="chat-busy muted small">Claude travaille…</div>}
      <div ref={end} />
    </div>
  );
}

export function ChatInput({ workflowName, a }: { workflowName: string; a: ReturnType<typeof useAssistant> }) {
  const [text, setText] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const { status, statusError } = a;
  const disabledReason = statusError ? `Assistant indisponible : ${statusError}` : status && !status.enabled ? `Assistant désactivé : ${status.reason}` : null;
  const needsCode = !!status?.enabled && status.needsCode && !a.code;
  const canSend = !!status?.enabled && !needsCode && !a.busy && text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    a.send(text.trim());
    setText('');
  };

  return (
    <footer className="composer">
      {disabledReason && <p className="muted tiny composer-note">{disabledReason}</p>}
      {needsCode ? (
        <form
          className="composer-box"
          onSubmit={(e) => {
            e.preventDefault();
            if (codeDraft.trim()) a.setAccessCode(codeDraft.trim());
          }}
        >
          <input className="composer-code" type="password" placeholder="Code d’accès de l’assistant" value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} />
          <div className="composer-bar">
            <span className="grow" />
            <button className="send" type="submit" disabled={!codeDraft.trim()} aria-label="Valider">↑</button>
          </div>
        </form>
      ) : (
        <div className="composer-box">
          <textarea
            rows={2}
            placeholder="Demandez n’importe quoi à Claude, ou de modifier ce workflow…"
            value={text}
            disabled={!status?.enabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="composer-bar">
            <span className="ctx-chip" title="Workflow que Claude peut lire et modifier">@ {workflowName}</span>
            <span className="grow" />
            <span className="muted tiny">{status?.model.includes('sonnet') ? 'Sonnet' : status?.model ?? ''}</span>
            <button className="send" onClick={submit} disabled={!canSend} aria-label="Envoyer">↑</button>
          </div>
        </div>
      )}
    </footer>
  );
}
