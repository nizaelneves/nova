import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { PhibeNebula, type NebulaMood } from '../PhibeNebula';
import { useAppStore } from '../../lib/store';
import { useChat } from '../../lib/useChat';
import { toast } from 'sonner';
import { useSpeech } from '../../hooks/useSpeech';
import { isTauri } from '../../lib/api';
import { stopSpeaking } from '../../lib/voiceReply';
import { mentor } from '../../lib/mentor';
import { Typed } from './Typed';
import { Pick } from './Pick';
import { memoirChats, nameChat, titleCase, UNNAMED } from '../../lib/memoirChats';

const SAVED = 'memoir.mentor';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window: it just will not be remembered */ } };

/** Phibe as a mentor: lives in the floating button, never in the island. Study, brainstorm or work, in its own conversation. */
export function Mentor() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { send, stop } = useChat();
  const messages = useAppStore((s) => s.messages);
  const streaming = useAppStore((s) => s.streamState.isStreaming);
  const activeId = useAppStore((s) => s.activeId);
  const mine = useRef<string | null>(null);
  const before = useRef<string | null>(useAppStore.getState().activeId); // the chat to go back to when Memoir closes
  const end = useRef<HTMLDivElement>(null);
  const speech = useSpeech();
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const think = useAppStore((s) => s.deepResearch);
  const setThink = useAppStore((s) => s.setDeepResearch);
  const pendingVoice = useAppStore((s) => s.pendingVoice);
  const setPendingVoice = useAppStore((s) => s.setPendingVoice);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const [puff, setPuff] = useState(0);
  const [pleased, setPleased] = useState(false);
  const all = useAppStore((s) => s.conversations);
  const chats = useMemo(() => memoirChats(all), [all]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState(false); // a conversation not made yet: it is created when the first message is sent
  const [queued, setQueued] = useState<{ t: string; voice?: boolean } | null>(null);
  const NEW = '\u0000new';
  const was = useRef(false);
  // after the first answer, the conversation is named by its subject (Title Case); the user can rename it
  const nameIt = () => {
    window.setTimeout(() => {
      const st = useAppStore.getState(), c = st.conversations.find((x) => x.id === mine.current);
      if (!c || c.space !== 'memoir' || c.title !== UNNAMED) return;
      const q = c.messages.find((m) => m.role === 'user')?.content ?? '', a = c.messages.find((m) => m.role === 'assistant')?.content ?? '';
      if (q && !a) { st.renameConversation(c.id, titleCase(q.split(/\s+/).slice(0, 4).join(' ')) || UNNAMED); return; } // stopped before any answer: named from the question
      if (q && a) void nameChat(st.selectedModel, q, a).then((name) => { const now = useAppStore.getState().conversations.find((x) => x.id === c.id); if (now?.title === UNNAMED) useAppStore.getState().renameConversation(c.id, name); });
    }, 500);
  };
  // thinking while the answer is on its way, pleased for a moment when it lands
  useEffect(() => {
    if (was.current && !streaming) { nameIt(); setPleased(true); const id = setTimeout(() => setPleased(false), 2500); return () => clearTimeout(id); }
    was.current = streaming;
  }, [streaming]);
  const mood: NebulaMood | undefined = streaming ? 'thinking' : pleased ? 'happy' : undefined;
  const effects = useAppStore((s) => s.settings.effects);

  useEffect(() => { mentor.on = true; return () => { mentor.on = false; }; }, []);
  useEffect(() => () => { const id = before.current; if (id && useAppStore.getState().conversations.some((c) => c.id === id)) useAppStore.getState().selectConversation(id); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const toggle = () => {
    if (!open) { // its own conversations, kept between visits: open the last one, or wait for the first message
      const st = useAppStore.getState(), saved = read(SAVED), found = saved ? st.conversations.find((c) => c.id === saved) : undefined;
      if (found) { if (found.space !== 'memoir') st.setConversationSpace(found.id, 'memoir'); st.selectConversation(found.id); mine.current = found.id; setDraft(false); }
      else { mine.current = null; setDraft(true); }
    }
    setOpen(!open);
  };
  const choose = (id: string) => {
    if (id === NEW) { mine.current = null; setDraft(true); write(SAVED, ''); return; }
    useAppStore.getState().selectConversation(id); write(SAVED, id); mine.current = id; setDraft(false);
  };
  useEffect(() => { // the open conversation was deleted (in Settings): back to a new one
    if (open && !draft && mine.current && !chats.some((c) => c.id === mine.current)) { mine.current = null; setDraft(true); }
  }, [open, draft, chats]);
  // Sends a message; when there is no conversation yet, it is made first and the message goes once it is the active one.
  const say = (t: string, voice?: boolean) => {
    if (mine.current && chats.some((c) => c.id === mine.current)) { void send(t, voice); return; }
    const id = useAppStore.getState().createConversation(undefined, 'memoir');
    write(SAVED, id); mine.current = id; setDraft(false); setQueued({ t, voice });
  };
  useEffect(() => { if (queued && activeId === mine.current) { const q = queued; setQueued(null); void send(q.t, q.voice); } }, [queued, activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = !draft && mine.current && chats.some((c) => c.id === mine.current) ? mine.current : NEW;
  useEffect(() => { if (speech.error) toast.error(speech.error, { duration: 8000 }); }, [speech.error]);
  // A message spoken with the desktop voice shortcut lands here too: the panel opens and the answer is read aloud.
  useEffect(() => {
    if (!pendingVoice || pendingVoice.mode !== 'send' || streaming || modelLoading) return;
    setPendingVoice(null);
    if (!open) toggle();
    say(pendingVoice.text, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const speechReady = () => {
    if (!speechEnabled || !speech.available) { toast.error(!speechEnabled ? 'Enable speech in Settings first' : 'Speech backend not configured'); return false; }
    return true;
  };
  // Microphone: dictates into the message box.
  const onMic = async () => {
    if (speech.state === 'recording') {
      try { const t = await speech.stopRecording(); if (t) setText((p) => (p ? `${p} ${t}` : t)); } catch { /* shown by the hook */ }
    } else if (speechReady()) { stopSpeaking(); await speech.startRecording(); }
  };
  // Voice Mode: speak, and the answer is spoken back. On the desktop the global voice engine listens; in a browser this records, then sends.
  const onVoice = async () => {
    if (isTauri()) { const { invoke } = await import('@tauri-apps/api/core'); void invoke('voice_toggle'); return; }
    if (!speechReady()) return;
    if (speech.state === 'recording') {
      try { const t = await speech.stopRecording(); if (t) say(t, true); } catch { /* shown by the hook */ }
    } else if (speech.state === 'idle') { stopSpeaking(); await speech.startRecording(); }
  };

  const shown = open && !draft && activeId === mine.current ? messages : [];
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (text.trim() && !streaming) { say(text); setText(''); } };

  return (
    <>
      <button type="button" className="mm-fab" onClick={() => { setPuff((n) => n + 1); toggle(); }} aria-expanded={open} aria-label="Mentor">
        <PhibeNebula mood={mood} burstKey={puff} life={mood === undefined && effects !== 'off'} />
      </button>
      {open && (
        <div className="mm-mentor" role="dialog" aria-label="Mentor">
          <button type="button" className="mm-x" aria-label="Close Mentor" onClick={toggle}><Icon name="close-circle" size={18} /></button>
          <div className="mm-chatbar">
            {renaming === null ? (
              <>
                <Pick className="mm-chatpick" label="Conversations" value={current} onChange={choose}
                  options={[...chats.filter((c) => c.messages.length > 0 || c.id === current).map((c) => ({ value: c.id, label: c.title })), { value: NEW, label: draft ? 'New Conversation' : 'New Conversation…' }]} />
                {!draft && <button type="button" className="mm-ic" aria-label="Rename Conversation" title="Rename" onClick={() => setRenaming(chats.find((c) => c.id === current)?.title ?? '')}><Icon name="lucide-file-pen" size={15} /></button>}
              </>
            ) : (
              <input autoFocus className="mm-chatname" value={renaming} aria-label="Conversation Name" onChange={(e) => setRenaming(e.target.value)}
                onBlur={() => { if (renaming.trim()) useAppStore.getState().renameConversation(current, renaming); setRenaming(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
            )}
          </div>
          <div className="mm-msgs">
            {shown.map((m) => (m.role === 'assistant' && !m.content
              ? <div key={m.id} className="mm-msg mm-dots"><i /><i /><i /></div>
              : <div key={m.id} className={`mm-msg${m.role === 'user' ? ' me' : ''}`}>{m.content}</div>))}
            <div ref={end} />
          </div>
          <form className="mm-composer" onSubmit={submit}>
            <div className="mm-field">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder=" " aria-label="Message" autoFocus />
              {!text && <Typed text="How can I help you with?" />}
            </div>
            <div className="mm-tools">
              <button type="button" className="mm-ic" data-on={speech.state === 'recording'} aria-label="Dictate" data-tip="Dictate" disabled={speech.state === 'transcribing' || streaming} onClick={() => void onMic()}>
                <Icon name={speech.state === 'transcribing' ? 'refresh' : 'lucide-mic'} size={17} />
              </button>
              <button type="button" className="mm-ic mm-muse" data-glow={think} aria-pressed={think} aria-label="Muse" data-tip="Muse" onClick={() => setThink(!think)}>
                <Icon name="brain-cog" size={17} />
              </button>
              <button type="button" className="mm-ic" data-on={speech.state === 'recording'} aria-label="Voice" data-tip="Voice" onClick={() => void onVoice()}>
                <Icon name="phibe-voice" size={17} />
              </button>
              {streaming
                ? <button type="button" className="mm-send" aria-label="Stop" onClick={stop}><Icon name="stop-circle" size={18} /></button>
                : <button type="submit" className="mm-send" aria-label="Send" disabled={!text.trim()}><Icon name="arrow-up" size={18} /></button>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
