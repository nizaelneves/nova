import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

/** A countdown timer. One timer for the whole app: the island button controls it. */

export interface Timer {
  running: boolean;
  endsAt: number; // when it ends, while running
  left: number; // milliseconds left, while stopped
  minutes: number; // its length
}

export const initial = (minutes = 25): Timer => ({ running: false, endsAt: 0, left: minutes * 60_000, minutes });

/** Milliseconds left. It comes from the clock, not from counting ticks, so a hidden window does not slow it down. */
export const remaining = (t: Timer, now: number): number => (t.running ? Math.max(0, t.endsAt - now) : t.left);

export const start = (t: Timer, now: number): Timer => (t.running ? t : { ...t, running: true, endsAt: now + t.left });
export const pause = (t: Timer, now: number): Timer => (t.running ? { ...t, running: false, left: remaining(t, now) } : t);
export const reset = (t: Timer): Timer => ({ ...t, running: false, left: t.minutes * 60_000 });

/** Stops and rewinds a timer that has run out; a no-op before that. */
export const finish = (t: Timer, now: number): Timer => (t.running && now >= t.endsAt ? reset(t) : t);

/** A new length starts the timer over, stopped. */
export const setMinutes = (t: Timer, minutes: number): Timer => reset({ ...t, minutes });

/** 90000 milliseconds -> "01:30". */
export const clock = (ms: number): string => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---- the shared timer

const KEY = 'phibe-timer-minutes';
const saved = (): number => {
  try {
    const m = Number(localStorage.getItem(KEY));
    return Number.isFinite(m) && m > 0 ? m : 25;
  } catch {
    return 25;
  }
};

let state = initial(saved());
const listeners = new Set<() => void>();
const set = (next: Timer) => {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
};

export const timer = {
  start: () => set(start(state, Date.now())),
  pause: () => set(pause(state, Date.now())),
  reset: () => set(reset(state)),
  setMinutes: (minutes: number) => {
    set(setMinutes(state, minutes));
    try { localStorage.setItem(KEY, String(minutes)); } catch { /* blocked: lasts until the page closes */ }
  },
};

/** The shared timer and the time left, refreshed every second while it runs. */
export function useTimer(): Timer & { remaining: number } {
  const t = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!t.running) return undefined;
    const id = window.setInterval(() => {
      const at = Date.now();
      const next = finish(state, at);
      if (next !== state) toast('Timer finished.');
      set(next);
      setNow(at);
    }, 1000);
    return () => window.clearInterval(id);
  }, [t.running]);
  return { ...t, remaining: remaining(t, t.running ? now : Date.now()) };
}
