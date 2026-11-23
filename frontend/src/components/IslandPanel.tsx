import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { phibeChats } from '../lib/memoirChats';
import { toast } from 'sonner';
import { AttachMenu } from './Chat/AttachMenu';
import { EngineMenu } from './Chat/EngineMenu';
import { TuneMenu } from './Chat/TuneMenu';
import { Terminal } from './IslandTerminal';
import { MicButton } from './Chat/MicButton';
import { TimerButton } from './TimerButton';
import { Icon, type IconName } from './Icon';
import { useSpeech } from '../hooks/useSpeech';
import { approveAction, completePing, denyAction, fetchPings, isTauri } from '../lib/api';
import type { Ping, PendingApproval } from '../lib/api';
import type { ConversationFile } from '../types';
import { disintegrate } from '../lib/disintegrate';
import { CLI_ENGINES_ENABLED } from '../lib/features';
import { useAppStore } from '../lib/store';
import { timeAgo } from '../lib/time';
import { useChat } from '../lib/useChat';
import { dismissPhibeEventsOfKind } from '../lib/phibePresence';
import { stopSpeaking } from '../lib/voiceReply';

export type IslandLevel = 'pill' | 'card' | 'panel';
export type IslandSection = 'approvals' | 'chats' | 'pings';

/** Always in alphabetical order, whatever gets added later. */
const SECTIONS: { id: IslandSection; label: string; icon: IconName }[] = ([
  { id: 'chats', label: 'Chats', icon: 'chat-round-dots' },
  { id: 'approvals', label: 'Approvals', icon: 'shield-check' },
  { id: 'pings', label: 'Pings', icon: 'bell' },
] as { id: IslandSection; label: string; icon: IconName }[]).sort((a, b) => a.label.localeCompare(b.label));

/** The suggestion in the empty message box; Tab accepts it. */
const SUGGESTION = 'How can I assist you today?';
const NO_FILES: ConversationFile[] = [];

/** How risky an action is, from quiet to loud. */
const TIER: Record<PendingApproval['tier'], { label: string; color: string }> = {
  trivial: { label: 'Trivial', color: '#8b93a7' },
  low: { label: 'Low', color: '#10c3d3' },
  medium: { label: 'Medium', color: '#ffc857' },
  high: { label: 'High', color: '#ff6b6b' },
};

/**
 * What the island shows when it grows. The card answers an approval on the spot; the panel has
 * three sections (approvals, chats, pings, in alphabetical order) and, fixed under Phibe's face, the Muse,
 * Voice and Microphone buttons. The chat is the real one: it sends, streams, uses tools and
 * speaks like the chat screen does.
 */
export function IslandPanel({ level, section, onSection, pending, onDecided, onClose, onExtra }: {
  level: IslandLevel;
  section: IslandSection;
  onSection: (s: IslandSection) => void;
  pending: PendingApproval[];
  onDecided: () => void;
  onClose: () => void;
  /** Extra height the island needs while the message box grows. */
  onExtra: (px: number) => void;
}) {
  const chat = useChat();
  const think = useAppStore((s) => s.deepResearch);
  const setThink = useAppStore((s) => s.setDeepResearch);
  const streaming = useAppStore((s) => s.streamState.isStreaming);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const pendingVoice = useAppStore((s) => s.pendingVoice);
  const setPendingVoice = useAppStore((s) => s.setPendingVoice);
  const speech = useSpeech();
  const [draft, setDraft] = useState('');
  const dictated = useRef(false);
  const first = pending[0];

  useEffect(() => { if (speech.error) toast.error(speech.error, { duration: 8000 }); }, [speech.error]);

  /** Sends the answer, lets the card drift away if there is one, then refreshes the list. */
  const decide = async (id: string, action: 'approve' | 'deny', card?: HTMLElement | null) => {
    try {
      await (action === 'approve' ? approveAction(id) : denyAction(id));
      toast.success(action === 'approve' ? 'Approved' : 'Denied');
      await disintegrate(card, action === 'approve' ? '#20e7aa' : '#ff6b6b');
      onDecided();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your answer');
    }
  };

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming) return;
    const fromVoice = dictated.current;
    dictated.current = false;
    setDraft('');
    void chat.send(text, fromVoice);
  }, [draft, streaming, chat]);

  // The microphone dictates into the message box.
  const micDisabled = !speechEnabled || !speech.available || streaming;
  const micReason = !speechEnabled ? 'not-enabled' : !speech.available ? 'no-backend' : streaming ? 'streaming' : undefined;
  const onMic = async () => {
    if (speech.state === 'recording') {
      try {
        const text = await speech.stopRecording();
        if (text) {
          dictated.current = true;
          setDraft((prev) => (prev ? `${prev} ${text}` : text));
        }
      } catch {
        // The error is shown by the speech hook.
      }
    } else {
      stopSpeaking();
      await speech.startRecording();
    }
  };

  // Voice Mode: on the desktop the global voice engine listens; in a browser this records, then sends.
  const onVoice = async () => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      void invoke('voice_toggle');
      return;
    }
    if (!speechEnabled || !speech.available) {
      toast.error(!speechEnabled ? 'Enable speech in Settings first' : 'Speech backend not configured');
      return;
    }
    if (speech.state === 'recording') {
      try {
        const text = await speech.stopRecording();
        if (text) setPendingVoice({ id: Date.now(), text, mode: 'send' });
      } catch {
        // The error is shown by the speech hook.
      }
    } else if (speech.state === 'idle') {
      stopSpeaking();
      await speech.startRecording();
    }
  };

  // A message spoken with the voice shortcut: the island takes it and opens itself, so the answer can be read.
  useEffect(() => {
    if (!pendingVoice || streaming || modelLoading) return;
    setPendingVoice(null);
    window.dispatchEvent(new CustomEvent('phibe:island', { detail: 'chats' }));
    if (pendingVoice.mode === 'send') void chat.send(pendingVoice.text, true);
    else {
      setDraft((prev) => (prev.trim() ? `${prev.trim()} ${pendingVoice.text}` : pendingVoice.text));
      dismissPhibeEventsOfKind('draft');
    }
  }, [pendingVoice, streaming, modelLoading, setPendingVoice, chat]);

  if (level === 'pill') return null;

  if (level === 'card') {
    return first ? (
      <div className="isl-body isl-card" onClick={(e) => e.stopPropagation()}>
        <p>{first.description}</p>
        <div>
          <button type="button" className="isl-deny" onClick={() => void decide(first.id, 'deny')}>Deny</button>
          <button type="button" className="isl-ok" onClick={() => void decide(first.id, 'approve')}>Approve</button>
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      <div className="isl-body isl-panel" onClick={(e) => e.stopPropagation()}>
        <div className="isl-tabs" role="tablist" aria-label="Phibe sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={section === s.id} data-active={section === s.id}
              aria-label={s.label} title={s.label} onClick={() => onSection(s.id)}>
              <Icon name={s.icon} size={17} />
              {s.id === 'approvals' && pending.length > 0 && <i className="isl-badge" />}
            </button>
          ))}
          <button type="button" className="isl-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <Icon name="alt-arrow-down" size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>

        <div className="isl-sec" key={section}>
          {section === 'chats' && <Chats draft={draft} setDraft={setDraft} send={send} stop={chat.stop} onExtra={onExtra} pending={pending} decide={decide} />}
          {section === 'approvals' && <Approvals pending={pending} decide={decide} />}
          {section === 'pings' && <Pings />}
        </div>
      </div>

      <div className="isl-dock" onClick={(e) => e.stopPropagation()}>
        <TimerButton />
        <MicButton state={speech.state} onClick={() => void onMic()} disabled={micDisabled} reason={micReason} />
        <button type="button" className="composer-icon" data-on={speech.state === 'recording'} aria-label="Voice Mode" title="Voice Mode" onClick={() => void onVoice()}>
          <Icon name="soundwave" size={18} />
        </button>
        <button type="button" className="composer-icon" data-on={think} aria-pressed={think} aria-label="Muse"
          title={think ? 'Muse: ON' : 'Muse: OFF'} onClick={() => setThink(!think)}>
          <Icon name="brain-cog" size={18} />
        </button>
      </div>
    </>
  );
}

function Approvals({ pending, decide }: {
  pending: PendingApproval[];
  decide: (id: string, a: 'approve' | 'deny', card?: HTMLElement | null) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cards = useRef<Record<string, HTMLElement | null>>({});

  if (pending.length === 0) return <div className="isl-empty">Nothing is waiting for you</div>;
  return (
    <div className="isl-list">
      {pending.map((a) => {
        const tier = TIER[a.tier] ?? TIER.trivial;
        const shown = open === a.id;
        return (
          <div key={a.id} className="isl-ap" ref={(el) => { cards.current[a.id] = el; }} style={{ ['--tone' as string]: tier.color }}>
            <div className="isl-ap-main">
              <div className="isl-ap-meta"><b>{tier.label}</b><span>{a.action_type} · {timeAgo(a.created_at)}</span></div>
              <p>{a.description}</p>
              <button type="button" className="isl-more" onClick={() => setOpen(shown ? null : a.id)}>
                <Icon name="alt-arrow-down" size={11} style={{ transform: shown ? 'rotate(180deg)' : undefined }} />
                {shown ? 'Hide Details' : 'Show Details'}
              </button>
              {shown && <pre>{JSON.stringify(a.payload, null, 2)}</pre>}
            </div>
            <div className="isl-ap-actions">
              <button type="button" className="isl-deny" onClick={() => void decide(a.id, 'deny', cards.current[a.id])}>Deny</button>
              <button type="button" className="isl-ok" onClick={() => void decide(a.id, 'approve', cards.current[a.id])}>Approve</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "Today", "Tomorrow", otherwise the weekday and the day ("Fri, Nov 14"). */
function dayLabel(iso: string): string {
  const day = new Date(`${iso}T00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function Pings() {
  const [pings, setPings] = useState<Ping[] | null>(null);
  const load = () => fetchPings()
    .then((all) => setPings(all.filter((p) => !p.completed).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5)))
    .catch(() => setPings([]));
  useEffect(() => { void load(); }, []);

  if (pings === null) return null;
  if (pings.length === 0) return <div className="isl-empty">Nothing scheduled</div>;
  return (
    <div className="isl-list">
      {pings.map((p) => (
        <div key={p.id} className="isl-row" data-late={new Date(`${p.date}T${p.time}`) < new Date()}>
          <div className="isl-ping">
            <b>{p.text}</b>
            <div className="isl-when">
              <i data-k="date"><Icon name="calendar" size={12} />{dayLabel(p.date)}</i>
              <i data-k="time"><Icon name="clock-circle" size={12} />{p.time}</i>
              {p.repeat_type !== 'none' && <i data-k="repeat" title="Repeats"><Icon name="repeat" size={12} /></i>}
            </div>
          </div>
          <button type="button" className="isl-ok" onClick={() => void completePing(p.id).then(load)}>Done</button>
        </div>
      ))}
    </div>
  );
}

function Chats({ draft, setDraft, send, stop, onExtra, pending, decide }: {
  draft: string;
  setDraft: (v: string) => void;
  send: () => void;
  stop: () => void;
  onExtra: (px: number) => void;
  pending: PendingApproval[];
  decide: (id: string, a: 'approve' | 'deny', card?: HTMLElement | null) => Promise<void>;
}) {
  const messages = useAppStore((s) => s.messages);
  const allChats = useAppStore((s) => s.conversations);
  const conversations = useMemo(() => phibeChats(allChats), [allChats]);
  const activeId = useAppStore((s) => s.activeId);
  const model = useAppStore((s) => s.selectedModel);
  const stream = useAppStore((s) => s.streamState);
  const [history, setHistory] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const stuck = useRef(true); // keep following the answer unless the reader scrolled up

  const answering = stream.isStreaming && stream.conversationId === activeId;
  const files = useAppStore((s) => s.conversations.find((c) => c.id === s.activeId)?.files) ?? NO_FILES;
  const last = messages[messages.length - 1];

  useEffect(() => { input.current?.focus(); }, []);

  // The message box grows downwards while you type, and the island grows with it so the
  // conversation above stays in view.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, 150);
    el.style.height = `${h}px`;
    onExtra(Math.max(0, h - 24));
  }, [draft, onExtra]);
  useEffect(() => () => onExtra(0), [onExtra]);

  useEffect(() => {
    const el = log.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.content, last?.toolCalls?.length, stream.phase, pending.length]);

  const newChat = () => {
    const s = useAppStore.getState();
    if (s.messages.length > 0) s.createConversation(s.selectedModel);
    setHistory(false);
    input.current?.focus();
  };

  const commitRename = () => {
    if (renaming) useAppStore.getState().renameConversation(renaming, name);
    setRenaming(null);
  };

  return (
    <div className="isl-chat">
      <div className="isl-chat-head">
        <div className="isl-tools">
          <TuneMenu disabled={answering} />
          <button type="button" className="composer-chip isl-model-chip" title="Choose a model (Ctrl+K)" disabled={answering}
            onClick={() => useAppStore.getState().setCommandPaletteOpen(true)}>
            <Icon name="cpu" size={13} />
            <span className="truncate">{model || 'Select model'}</span>
          </button>
          {CLI_ENGINES_ENABLED && <EngineMenu disabled={answering} />}
          <AttachMenu disabled={answering} />
          {answering ? (
            <button type="button" className="isl-send" data-stop="true" aria-label="Stop generating" title="Stop generating" onClick={stop}>
              <Icon name="stop-circle" size={16} />
            </button>
          ) : (
            <button type="button" className="isl-send" aria-label="Send message" title="Send (Enter)" onClick={send} disabled={!draft.trim() || !model}>
              <Icon name="arrow-up" size={16} />
            </button>
          )}
        </div>
        <button type="button" aria-label="Recent chats" title="Recent chats" data-on={history} onClick={() => setHistory((v) => !v)}>
          <Icon name="clock-circle" size={15} />
        </button>
        <button type="button" aria-label="New chat" title="New chat" onClick={newChat}>
          <Icon name="add-circle" size={15} />
        </button>
      </div>

      {history && (
        <div className="isl-history">
          {conversations.length === 0 && <div className="isl-empty">No chats yet</div>}
          {conversations.slice(0, 5).map((c) => {
            const busy = stream.isStreaming && stream.conversationId === c.id;
            return (
              <div key={c.id} className="isl-hrow" data-active={c.id === activeId}>
                {renaming === c.id ? (
                  <input autoFocus value={name} aria-label="Chat name" onChange={(e) => setName(e.target.value)} onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') setRenaming(null); }} />
                ) : (
                  <button type="button" className="isl-hopen"
                    onClick={() => { useAppStore.getState().selectConversation(c.id); setHistory(false); }}>
                    <span className="truncate">{c.title}</span><em>{timeAgo(new Date(c.updatedAt).toISOString())}</em>
                  </button>
                )}
                <button type="button" aria-label="Rename chat" title="Rename" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setName(c.title); setRenaming(c.id); }}>
                  <Icon name="pen" size={13} />
                </button>
                <button type="button" aria-label="Delete chat" title={busy ? 'Stop generating first' : 'Delete'} disabled={busy}
                  onClick={(e) => {
                    const row = e.currentTarget.closest('.isl-hrow') as HTMLElement | null;
                    void disintegrate(row, '#ff6b6b').then(() => useAppStore.getState().deleteConversation(c.id));
                  }}>
                  <Icon name="trash-bin-2" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="isl-log tm" ref={log} onScroll={(e) => {
        const el = e.currentTarget;
        stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}>
        <Terminal messages={messages} answering={answering} phase={stream.phase} pending={pending}
          decide={(id, action) => decide(id, action)} />
      </div>

      {files.length > 0 && (
        <div className="isl-files">
          {files.map((f) => (
            <span key={f.id} className="isl-file" title={`${f.markdown.length.toLocaleString()} characters`}>
              <Icon name="paperclip" size={11} />
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => activeId && useAppStore.getState().removeConversationFile(activeId, f.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="isl-composer">
        <span className="isl-prompt" aria-hidden="true">❯</span>
        <div className="isl-field">
          <textarea ref={input} rows={1} value={draft} aria-label="Message Phibe" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              // Tab accepts the suggestion shown as the placeholder (auto-complete)
              else if (e.key === 'Tab' && !e.shiftKey && !draft) { e.preventDefault(); setDraft(SUGGESTION); }
            }} />
          {!draft && <span className="isl-ph" aria-hidden="true"><span className="isl-ph-text">{SUGGESTION}</span></span>}
          {!draft && <kbd className="isl-tab" aria-hidden="true">Tab</kbd>}
        </div>
      </div>
    </div>
  );
}
