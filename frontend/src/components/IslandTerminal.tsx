import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { PendingApproval } from '../lib/api';
import type { ChatMessage, ToolCallInfo } from '../types';

/** The model's reasoning is not part of the output. */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').replace(/^[\s\S]*?<\/think>\s*/i, '').trim();
}

function toolLine(tc: ToolCallInfo) {
  const mark = tc.status === 'running' ? '…' : tc.status === 'success' ? '✓' : '✗';
  const args = tc.arguments.length > 70 ? `${tc.arguments.slice(0, 70)}…` : tc.arguments;
  return (
    <div key={tc.id} className="tm-tool" data-status={tc.status}>
      <span>{mark}</span> {tc.tool}
      {args && <em> {args}</em>}
      {tc.latency != null && <em> · {Math.round(tc.latency)} ms</em>}
    </div>
  );
}

function Output({ message, live }: { message: ChatMessage; live: boolean }) {
  const text = stripThink(message.content);
  const t = message.telemetry;
  return (
    <div className="tm-out">
      {message.researchTraces?.map((r) => (
        <div key={r.id} className="tm-tool" data-status={r.status === 'complete' ? 'success' : 'running'}>
          <span>{r.status === 'complete' ? '✓' : '…'}</span> search <em>{r.query}{r.numHits != null ? ` · ${r.numHits} hits` : ''}</em>
        </div>
      ))}
      {message.toolCalls?.map(toolLine)}
      {text && (
        <div className="tm-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>{text}</ReactMarkdown>
        </div>
      )}
      {!live && t?.total_ms != null && (
        <div className="tm-meta">
          {t.model_id ?? t.engine} · {(t.total_ms / 1000).toFixed(1)} s{t.tokens_per_sec ? ` · ${Math.round(t.tokens_per_sec)} tok/s` : ''}
        </div>
      )}
    </div>
  );
}

/**
 * The conversation as a terminal session: no bubbles. What you type is a prompt line, what
 * Phibe does is output, tool calls are short status lines and approvals show up inline.
 */
export function Terminal({ messages, answering, phase, pending, decide }: {
  messages: ChatMessage[];
  answering: boolean;
  phase: string;
  pending: PendingApproval[];
  decide: (id: string, action: 'approve' | 'deny') => Promise<void>;
}) {
  return (
    <>
      {messages.map((m, i) => (
        m.role === 'user' ? (
          <div key={m.id} className="tm-user"><span aria-hidden="true">❯</span><p>{m.content}</p></div>
        ) : (
          <Output key={m.id} message={m} live={answering && i === messages.length - 1} />
        )
      ))}
      {answering && <div className="tm-status">{phase || 'Working'}<i className="tm-cursor" /></div>}
      {pending.slice(0, 3).map((a) => (
        <div key={a.id} className="tm-ask">
          <span aria-hidden="true">!</span>
          <p>{a.description}</p>
          <button type="button" className="isl-deny" onClick={() => void decide(a.id, 'deny')}>Deny</button>
          <button type="button" className="isl-ok" onClick={() => void decide(a.id, 'approve')}>Approve</button>
        </div>
      ))}
    </>
  );
}
