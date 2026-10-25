/**
 * What the voice card shows for each state sent by the desktop app. Pure, so it can be
 * tested without a window.
 */
import type { BadgeGlyphKind } from '../components/BadgeIcon';

export type VoicePhase = 'idle' | 'listening' | 'countdown' | 'sending' | 'error';

export interface VoiceProblem {
  badge: BadgeGlyphKind;
  title: string;
  message: string;
  /** What the button does: "open_mic_settings" or "open_phibe". */
  action: string | null;
  action_label: string | null;
}

export interface VoiceState {
  phase: VoicePhase;
  /** The microphone is delivering samples. */
  ready: boolean;
  /** The shortcut that ends the recording, e.g. "Ctrl+Alt+P". */
  shortcut: string;
  /** What Phibe understood, once the transcript is ready. */
  heard?: string | null;
  /** Seconds the countdown starts from. */
  countdown_secs?: number | null;
  /** Something was said before the silence (it will be kept as a draft). */
  speech_seen?: boolean;
  problem?: VoiceProblem | null;
  /** The floating button is on: outside the app only the button shows, without the card. */
  floating?: boolean;
  /** The floating button sits on the right edge (so a side-view avatar faces left). */
  float_right?: boolean;
}

export const INITIAL_VOICE_STATE: VoiceState = { phase: 'idle', ready: false, shortcut: 'Ctrl+Alt+P' };

export interface CardBadge {
  glyph: BadgeGlyphKind | null;
  /** Text shown instead of a symbol (the countdown number). */
  label: string | null;
  color: string;
}

interface CardView {
  title: string;
  /** Show the red recording dot. */
  recording: boolean;
  /** Show the running timer. */
  timer: boolean;
  /** The bars react to the voice. */
  live: boolean;
  /** Ring style around the avatar. */
  ring: 'listen' | 'send' | 'count' | 'none';
  /** Secondary line, when there is one. */
  detail: string | null;
  tone: 'normal' | 'error';
  /** The badge on the avatar, with no sound: a symbol per situation. */
  badge: CardBadge | null;
  /** The one button a problem offers. */
  action: { id: string; label: string } | null;
  /** Show the Fibonacci numbers that count while the message goes to Phibe. */
  numbers: boolean;
  /** Show the key hint (send / cancel). */
  hint: boolean;
}

const TEAL = '#14b8a6';
const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREY = '#64748b';
const GREEN = '#22c55e';

const blank: CardView = {
  title: '',
  recording: false,
  timer: false,
  live: false,
  ring: 'none',
  detail: null,
  tone: 'normal',
  badge: null,
  action: null,
  numbers: false,
  hint: false,
};

/** `secondsLeft` is the live countdown; the card computes it from `countdown_secs`. */
export function cardView(state: VoiceState, secondsLeft?: number): CardView {
  switch (state.phase) {
    case 'listening':
      return state.ready
        ? { ...blank, title: 'Listening', recording: true, timer: true, live: true, ring: 'listen', badge: { glyph: 'wave', label: null, color: TEAL }, hint: true }
        : // The window is up before the microphone is: say so instead of looking frozen.
          { ...blank, title: 'Starting the microphone…', ring: 'listen' };
    case 'countdown': {
      const n = Math.max(0, Math.ceil(secondsLeft ?? state.countdown_secs ?? 0));
      return {
        ...blank,
        title: `Closing in ${n}…`,
        live: true,
        ring: 'count',
        detail: state.speech_seen ? 'What you said will wait as a draft.' : 'You have not said anything.',
        badge: { glyph: null, label: String(n), color: GREY },
        hint: true,
      };
    }
    case 'sending':
      return state.heard
        ? { ...blank, title: 'Sent', ring: 'none', detail: `“${state.heard}”`, badge: { glyph: 'done', label: null, color: GREEN } }
        : { ...blank, title: 'Sending ...', ring: 'send', numbers: true, badge: { glyph: 'send', label: null, color: TEAL } };
    case 'error': {
      const p = state.problem;
      return {
        ...blank,
        title: p?.title ?? 'Voice problem',
        tone: 'error',
        detail: p?.message ?? 'Something went wrong.',
        badge: { glyph: p?.badge ?? 'bang', label: null, color: p?.badge === 'download' ? AMBER : RED },
        action: p?.action && p.action_label ? { id: p.action, label: p.action_label } : null,
      };
    }
    default:
      return blank;
  }
}

/** The last `size` numbers of the Fibonacci sequence up to step `tick` (1, 1, 2, 3, 5, 8, ...). */
export function fibWindow(tick: number, size: number): number[] {
  const all: number[] = [];
  for (let i = 0, a = 1, b = 1; i <= tick; i++, [a, b] = [b, a + b]) all.push(a);
  return all.slice(-size);
}

/** "0:07" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "Ctrl+Alt+P" -> ["Ctrl", "Alt", "P"] */
export function keyParts(shortcut: string): string[] {
  return shortcut.split('+').map((k) => k.trim()).filter(Boolean);
}
