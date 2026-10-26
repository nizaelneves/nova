import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSpeech } from '../hooks/useSpeech';
import { useAppStore } from '../lib/store';
import { shortcutFromEvent } from '../lib/shortcutKeys';
import { stopSpeaking } from '../lib/voiceReply';
import { INITIAL_VOICE_STATE, type VoiceState } from './voiceCardModel';

const VOICE_KEY = 'phibe-voice-settings';
const SPEAKING = 0.06; // least loudness (0 to 1) that can count as talking; the room noise raises it

function readSettings() {
  let saved: { shortcut?: string; silence_secs?: number; countdown_secs?: number } = {};
  try { saved = JSON.parse(localStorage.getItem(VOICE_KEY) ?? '{}'); } catch { /* defaults */ }
  return { shortcut: saved.shortcut ?? 'Ctrl+Alt+P', silence: saved.silence_secs ?? 7, countdown: saved.countdown_secs ?? 5 };
}

/**
 * Voice mode in the browser: the same flow as the desktop card (listen, silence, countdown, send or
 * draft) with the microphone of the page. The shortcut works while the Phibe tab is in front.
 * The shortcut opens it, Space sends now, Esc cancels, silence ends it as a draft.
 */
export function useWebVoice() {
  const { startRecording, stopRecording, cancelRecording, levelRef, state: micState, error, available } = useSpeech();
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const setPendingVoice = useAppStore((s) => s.setPendingVoice);
  const [state, setState] = useState<VoiceState>(INITIAL_VOICE_STATE);
  const live = useRef(state);
  const spoke = useRef(false);
  const quietSince = useRef(0);
  const countdownEnd = useRef(0);
  const floor = useRef(-1); // the room noise: the lowest steady level heard
  const timing = useRef({ silence: 7, countdown: 5 });

  const update = useCallback((next: Partial<VoiceState>) => {
    live.current = { ...live.current, ...next };
    setState(live.current);
  }, []);

  const finish = useCallback(async (mode: 'send' | 'draft' | 'cancel') => {
    const phase = live.current.phase;
    if (phase === 'idle' || phase === 'sending') return;
    if (mode === 'cancel' || (mode === 'draft' && !spoke.current)) {
      cancelRecording();
      update({ phase: 'idle' });
      return;
    }
    update({ phase: 'sending', heard: null });
    try {
      const text = (await stopRecording()).trim();
      if (!text) {
        toast('Phibe heard nothing');
        update({ phase: 'idle' });
        return;
      }
      setPendingVoice({ id: Date.now(), text, mode: mode === 'send' ? 'send' : 'draft' });
      update({ heard: text });
      setTimeout(() => { if (live.current.phase === 'sending') update({ phase: 'idle', heard: null }); }, 1500);
    } catch {
      update({ phase: 'idle' }); // the speech hook shows the error
    }
  }, [cancelRecording, stopRecording, setPendingVoice, update]);

  const toggle = useCallback(async () => {
    if (live.current.phase === 'idle') {
      if (!speechEnabled || !available) {
        toast.error(!speechEnabled ? 'Enable speech in Settings first' : 'Speech backend not configured');
        return;
      }
      const s = readSettings();
      timing.current = { silence: s.silence, countdown: s.countdown };
      spoke.current = false;
      stopSpeaking();
      update({ phase: 'listening', ready: false, shortcut: 'Space', heard: null, speech_seen: false, problem: null, countdown_secs: s.countdown });
      await startRecording();
    } else if (live.current.phase === 'listening' || live.current.phase === 'countdown') {
      void finish('send');
    }
  }, [speechEnabled, available, startRecording, finish, update]);

  // The microphone is open: the card stops saying it is starting.
  useEffect(() => {
    if (micState === 'recording' && live.current.phase === 'listening') {
      quietSince.current = performance.now();
      floor.current = -1;
      update({ ready: true });
    }
  }, [micState, update]);

  useEffect(() => {
    if (error && live.current.phase !== 'idle') {
      update({ phase: 'error', problem: { badge: 'bang', title: 'Microphone problem', message: error, action: null, action_label: null } });
      setTimeout(() => { if (live.current.phase === 'error') update({ phase: 'idle', problem: null }); }, 6000);
    }
  }, [error, update]);

  // Silence: after `silence` quiet seconds the countdown starts; speaking again stops it.
  useEffect(() => {
    if (state.phase !== 'listening' && state.phase !== 'countdown') return;
    const id = setInterval(() => {
      if (!live.current.ready) return;
      const now = performance.now();
      const level = levelRef.current;
      // Follows the noise down at once and up very slowly, so a voice never becomes the "noise".
      floor.current = floor.current < 0 || level < floor.current ? level : floor.current + (level - floor.current) * 0.003;
      if (level > Math.max(SPEAKING, floor.current * 1.8 + 0.03)) {
        quietSince.current = now;
        if (!spoke.current) { spoke.current = true; update({ speech_seen: true }); }
        if (live.current.phase === 'countdown') update({ phase: 'listening' });
      } else if (live.current.phase === 'listening' && now - quietSince.current >= timing.current.silence * 1000) {
        countdownEnd.current = now + timing.current.countdown * 1000;
        update({ phase: 'countdown' });
      } else if (live.current.phase === 'countdown' && now >= countdownEnd.current) {
        void finish('draft');
      }
    }, 100);
    return () => clearInterval(id);
  }, [state.phase, levelRef, finish, update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current.phase !== 'idle') {
        void finish('cancel');
        return;
      }
      const phase = live.current.phase;
      if (e.code === 'Space' && (phase === 'listening' || phase === 'countdown')) {
        e.preventDefault();
        void finish('send');
      } else if (phase === 'idle' && shortcutFromEvent(e) === readSettings().shortcut) {
        e.preventDefault();
        void toggle();
      }
    };
    const onToggle = () => void toggle();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('phibe:voice-toggle', onToggle);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('phibe:voice-toggle', onToggle);
    };
  }, [toggle, finish]);

  return { state, levelRef };
}
