import { useEffect, useRef, useState } from 'react';
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
  const pendingVoice = useAppStore((s) => s.pendingVoice);
  const setPendingVoice = useAppStore((s) => s.setPendingVoice);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const [puff, setPuff] = useState(0);
  const [pleased, setPleased] = useState(false);
  const was = useRef(false);
  // thinking while the answer is on its way, pleased for a moment when it lands
  useEffect(() => {
    if (was.current && !streaming) { setPleased(true); const id = setTimeout(() => setPleased(false), 2500); return () => clearTimeout(id); }
    was.current = streaming;
  }, [streaming]);
  const mood: NebulaMood | undefined = streaming ? 'thinking' : pleased ? 'happy' : undefined;

  useEffect(() => { mentor.on = true; return () => { mentor.on = false; }; }, []);
  useEffect(() => () => { const id = before.current; if (id && useAppStore.getState().conversations.some((c) => c.id === id)) useAppStore.getState().selectConversation(id); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const toggle = () => {
    if (!open) { // its own conversation, kept between visits
      const s = useAppStore.getState(), saved = read(SAVED);
      if (saved && s.conversations.some((c) => c.id === saved)) s.selectConversation(saved);
      else { const id = s.createConversation(); s.renameConversation(id, 'Mentor'); write(SAVED, id); }
      mine.current = useAppStore.getState().activeId;
    }
    setOpen(!open);
  };
  useEffect(() => { if (speech.error) toast.error(speech.error, { duration: 8000 }); }, [speech.error]);
  // A message spoken with the desktop voice shortcut lands here too: the panel opens and the answer is read aloud.
  useEffect(() => {
    if (!pendingVoice || pendingVoice.mode !== 'send' || streaming || modelLoading) return;
    setPendingVoice(null);
    if (!open) toggle();
    void send(pendingVoice.text, true);
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
      try { const t = await speech.stopRecording(); if (t) void send(t, true); } catch { /* shown by the hook */ }
    } else if (speech.state === 'idle') { stopSpeaking(); await speech.startRecording(); }
  };

  const shown = open && activeId === mine.current ? messages : [];
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (text.trim() && !streaming) { void send(text); setText(''); } };

  return (
    <>
      <button type="button" className="mm-fab" onClick={() => { setPuff((n) => n + 1); toggle(); }} aria-expanded={open} aria-label="Mentor">
        <PhibeNebula mood={mood} burstKey={puff} />
      </button>
      {open && (
        <div className="mm-mentor" role="dialog" aria-label="Mentor">
          <button type="button" className="mm-x" aria-label="Close Mentor" onClick={toggle}><Icon name="close-circle" size={18} /></button>
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
              <button type="button" className="mm-ic" data-on={speech.state === 'recording'} aria-label={speech.state === 'recording' ? 'Microphone: On' : 'Microphone'} title="Dictate" disabled={speech.state === 'transcribing' || streaming} onClick={() => void onMic()}>
                <Icon name={speech.state === 'transcribing' ? 'refresh' : 'microphone'} size={17} />
              </button>
              <button type="button" className="mm-ic" data-on={speech.state === 'recording'} aria-label="Voice Mode" title="Voice Mode" onClick={() => void onVoice()}>
                <Icon name="soundwave" size={17} />
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
