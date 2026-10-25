import type { MistState } from '../components/PhibeMist';

/** How fast the mist moves: 1 is the usual pace; thinking stirs it up, listening a little. Smaller means faster. */
export const paceOf = (state: MistState): number => (state === 'thinking' ? 0.55 : state === 'listening' ? 0.85 : 1);

interface Bar { x: number; h: number }

const BAR_XS = Array.from({ length: 22 }, (_, i) => -104 + i * 9.5);
/** A fixed, even-looking spread of phases so every bar moves on its own. */
const phase = (i: number): number => ((i * 0.6180339887) % 1) * 14;

/** Tallest a bar can be: the height of a 112-unit circle at that x, so the bars together draw a round shape. */
const roundHeight = (x: number): number => 2 * Math.sqrt(112 * 112 - x * x) * 0.98;

/**
 * The voice meter around the face. `level` is the loudness from 0 to 1 and `t` the time in seconds.
 * Each bar rides between about a quarter of its full height and all of it, never below 8 units.
 */
export function barHeights(level: number, t: number): Bar[] {
  const loud = Math.min(1, Math.max(0, level));
  return BAR_XS.map((x, i) => {
    const wave = 0.5 + 0.5 * Math.sin(t * 5.2 + phase(i));
    return { x, h: Math.max(8, roundHeight(x) * (0.28 + 0.72 * wave * loud)) };
  });
}

/** 1 while the body is whole, 0 once it has dissolved. `gone` (0 to 1) is how far the dissolve has gone. */
export const bodyVisibility = (gone: number): number => Math.min(1, Math.max(0, 1 - gone / 0.8));
