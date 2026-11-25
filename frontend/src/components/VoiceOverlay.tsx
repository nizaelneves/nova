import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../lib/api';
import { useSpeech } from '../hooks/useSpeech';
import { useAppStore } from '../lib/store';
import { loadVoiceSettings } from '../lib/voiceSettings';
import { stopSpeaking } from '../lib/voiceReply';
import { useVoiceEvents } from '../voice/VoiceCard';
import { VoicePill, type PillMode } from '../voice/VoicePill';
import { getVoiceLevel } from '../lib/voiceReply';
import { INITIAL_VOICE_STATE, matchesShortcut } from '../voice/voiceCardModel';
import { notifyPhibe } from '../lib/phibePresence';
import '../voice/voice.css';

/**
 * The voice card inside the app (desktop): while Phibe is open and in front, the recording
 * shows as the card alone. The avatar with its ring only shows in the floating window,
 * when the user is in another app.
 */
function DesktopVoiceCard() {
  const { state, levelRef } = useVoiceEvents();
  if (state.phase === 'idle' || state.floating) return null;
  const mode: PillMode =
    state.phase === 'listening' ? (state.ready ? 'listen' : 'starting') : state.phase === 'countdown' ? 'countdown' : state.phase === 'sending' ? (state.heard ? 'sent' : 'send') : 'error';
  return <VoicePill mode={mode} getLevel={() => levelRef.current} countdownSecs={state.countdown_secs ?? 0} message={state.problem?.message ?? state.problem?.title ?? ''} action={state.problem?.action && state.problem.action_label ? { label: state.problem.action_label, run: () => void invoke('voice_action', { action: state.problem!.action }) } : undefined} />;
}

/**
 * The voice shortcut in the browser. It only works while the Phibe tab is in front (a web page
 * cannot listen to keys anywhere else): press once to record, again to send, Esc to cancel.
 * The message goes to the island's chat the same way the desktop one does. Like the desktop app,
 * silence closes the card: after `silence_secs` without a voice a countdown starts; at zero what was
 * said waits as a draft (nothing said: it just closes).
 */
// shortcut: a fixed loudness threshold, not real voice detection; a noisy room may need it raised.
const VOICE_LEVEL = 0.12;
function WebVoiceCard() {
  const speech = useSpeech();
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const setPendingVoice = useAppStore((s) => s.setPendingVoice);
  const [shortcut, setShortcut] = useState(INITIAL_VOICE_STATE.shortcut);
  const [note, setNote] = useState<{ heard?: string; error?: string } | null>(null);
  const [counting, setCounting] = useState(false);
  const [heardSomething, setHeardSomething] = useState(false);
  const timing = useRef({ silence: 7, countdown: 5 });
  const live = useRef({ speech, speechEnabled, shortcut });
  live.current = { speech, speechEnabled, shortcut };

  /** Ends the recording: sent as a message, or kept as a draft when the silence closed it. */
  const finish = useCallback(async (mode: 'send' | 'draft') => {
    setCounting(false);
    try {
      const text = await live.current.speech.stopRecording();
      if (text) {
        setPendingVoice({ id: Date.now(), text, mode });
        if (mode === 'draft') notifyPhibe('draft', text);
      }
      setNote(text ? { heard: text } : null);
    } catch (err) {
      setNote({ error: err instanceof Error ? err.message : 'Transcription failed' });
    }
  }, [setPendingVoice]);

  // The shortcut is the one in Settings; read again when the tab comes back in front.
  useEffect(() => {
    const read = () => void loadVoiceSettings().then((v) => { setShortcut(v.shortcut); timing.current = { silence: v.silence_secs, countdown: v.countdown_secs }; }).catch(() => {});
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);

  // A notice (what was sent, or what went wrong) stays a moment, then the card goes away.
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), note.error ? 5000 : 3300); // the sent animation (dust, then the check) takes about 3 seconds
    return () => clearTimeout(id);
  }, [note]);
  useEffect(() => { if (speech.error) setNote({ error: speech.error }); }, [speech.error]);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const { speech: s, speechEnabled: enabled, shortcut: combo } = live.current;
      if (e.key === 'Escape' && s.state === 'recording') {
        s.cancelRecording();
        setCounting(false);
        return;
      }
      if (e.repeat || !matchesShortcut(e, combo)) return;
      e.preventDefault();
      if (s.state === 'transcribing') return;
      if (s.state === 'recording') {
        await finish('send');
        return;
      }
      if (!enabled || !s.available) {
        setNote({ error: !enabled ? 'Enable speech in Settings first' : 'Speech backend not configured' });
        return;
      }
      setNote(null);
      stopSpeaking();
      await s.startRecording();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  // Watches the loudness while recording: silence starts the countdown, a voice stops it.
  useEffect(() => {
    if (speech.state !== 'recording') return;
    const startedAt = Date.now();
    let lastVoice = startedAt;
    let countdownAt = 0;
    let said = false;
    let on = false;
    setHeardSomething(false);
    const id = setInterval(() => {
      const now = Date.now();
      if (speech.levelRef.current > VOICE_LEVEL) {
        lastVoice = now;
        if (!said) { said = true; setHeardSomething(true); }
        if (on) { on = false; setCounting(false); }
      }
      if (!on && now - lastVoice >= timing.current.silence * 1000) {
        on = true;
        countdownAt = now;
        setCounting(true);
      } else if (on && now - countdownAt >= timing.current.countdown * 1000) {
        clearInterval(id);
        if (said) void finish('draft');
        else { live.current.speech.cancelRecording(); setCounting(false); }
      }
    }, 100);
    return () => clearInterval(id);
  }, [speech.state, speech.levelRef, finish]);

  const speaking = useAppStore((s) => s.speaking);
  // What the pill shows, most urgent first: a problem, you talking, sending, "sent", then Phibe's own voice.
  const mode: PillMode | null = note?.error
    ? 'error'
    : speech.state === 'recording'
      ? counting ? 'countdown' : 'listen'
      : speech.state === 'transcribing'
        ? 'send'
        : note?.heard
          ? 'sent'
          : speaking
            ? 'speak'
            : null;
  if (!mode) return null;
  return <VoicePill mode={mode} getLevel={mode === 'speak' ? getVoiceLevel : () => speech.levelRef.current} countdownSecs={timing.current.countdown} message={note?.error} />;
}

export function VoiceOverlay() {
  return isTauri() ? <DesktopVoiceCard /> : <WebVoiceCard />;
}
