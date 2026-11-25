/**
 * When did the person last do something in Phibe? The orb's "life when you are away" (looking around, getting sleepy, sleeping, waking up)
 * is measured from here, by the wall clock, not by frames: frames stop while the tab is hidden, and that is exactly when you are away.
 */

let last = Date.now();
let wakeFrom = 0; // the longest time (seconds) she had been left alone before the activity since the last `takeWake()`
let installed = false;
let pinned: number | null = null; // the gallery holds the clock still on a phase

/** Seconds since the last activity. */
export const idleSeconds = (): number => pinned ?? (Date.now() - last) / 1000;

/** Something happened: a key, the mouse, coming back to the tab, a voice recording starting... */
export function touch(): void {
  if (pinned !== null) return;
  const idle = idleSeconds();
  if (idle > wakeFrom) wakeFrom = idle;
  last = Date.now();
}

/** How long she had been alone before she was disturbed (0 when nothing disturbed her), and forgets it. Read once per frame. */
export function takeWake(): number {
  const v = wakeFrom;
  wakeFrom = 0;
  return v;
}

/** Holds the idle clock at `seconds` (activity is ignored) or, with null, lets it run again and wakes her as if she had been disturbed. Used by the animation gallery. */
export function pinIdle(seconds: number | null): void {
  if (seconds === null) {
    if (pinned !== null && pinned > wakeFrom) wakeFrom = pinned;
    last = Date.now();
  }
  pinned = seconds;
}

/** For tests and for trying the phases by hand: pretend the last activity was this many seconds ago. */
export function setIdleSeconds(seconds: number): void {
  last = Date.now() - seconds * 1000;
}

/** Listens to the whole window once. Safe to call from every orb. */
export function installActivity(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const on = () => touch();
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'focus', 'phibe:activity']) window.addEventListener(type, on, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) touch(); });
}
