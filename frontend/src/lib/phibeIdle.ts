/**
 * What Phibe does when you are away, as plain numbers and choices (no drawing): which phase she is in for a given time
 * without activity, and what she does by lot while she is awake and alone.
 */

export type IdlePhase = 'active' | 'ociosa' | 'sonolenta' | 'dormindo' | 'profundo';

/** Seconds without activity at which each phase begins. Change these to change when she gets bored, sleepy and sleeps. */
export const PHASE_START = { ociosa: 8, sonolenta: 60, dormindo: 90, profundo: 180 } as const;

export function phaseOf(idleSeconds: number): IdlePhase {
  if (idleSeconds >= PHASE_START.profundo) return 'profundo';
  if (idleSeconds >= PHASE_START.dormindo) return 'dormindo';
  if (idleSeconds >= PHASE_START.sonolenta) return 'sonolenta';
  if (idleSeconds >= PHASE_START.ociosa) return 'ociosa';
  return 'active';
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const ramp = (x: number, a: number, b: number): number => clamp((x - a) / (b - a), 0, 1);
export const ease = (x: number): number => x * x * (3 - 2 * x);

/** How far into each sleep stage she is, from 0 to 1, for a time without activity. Drowsy, then a yawn and a stretch, asleep, then deep. */
export interface SleepEnv { oc: number; drowsy: number; yawn: number; asleep: number; shake: number; deep: number }
export function sleepEnv(idle: number): SleepEnv {
  return {
    oc: ramp(idle, PHASE_START.ociosa, PHASE_START.ociosa + 1) * (1 - ramp(idle, PHASE_START.sonolenta, PHASE_START.sonolenta + 2)),
    drowsy: ramp(idle, PHASE_START.sonolenta, PHASE_START.sonolenta + 20),
    yawn: ramp(idle, PHASE_START.dormindo, PHASE_START.dormindo + 1.5) * (1 - ramp(idle, PHASE_START.dormindo + 1.5, PHASE_START.dormindo + 4)),
    asleep: ramp(idle, PHASE_START.dormindo + 4, PHASE_START.dormindo + 6),
    shake: ramp(idle, PHASE_START.dormindo + 6, PHASE_START.dormindo + 6.3) * (1 - ramp(idle, PHASE_START.dormindo + 6.3, PHASE_START.dormindo + 7.3)),
    deep: ramp(idle, PHASE_START.profundo, PHASE_START.profundo + 3),
  };
}

export type Behavior = 'look' | 'bubbles' | 'star' | 'hum' | 'dance';

/** Chances (in parts) of what she does next. Humming and dancing need music: without it they are never picked. */
export const WEIGHTS: Record<'calm' | 'music', Record<Behavior, number>> = {
  calm: { look: 50, bubbles: 20, star: 30, hum: 0, dance: 0 },
  music: { look: 20, bubbles: 8, star: 7, hum: 35, dance: 30 },
};

/** How long each lasts, in seconds, from and to. */
export const DURATIONS: Record<Behavior, [number, number]> = { look: [6, 10], bubbles: [6, 9], star: [7, 11], hum: [8, 14], dance: [8, 14] };

/** Rest between one behaviour and the next, in seconds, from and to. */
export const REST: [number, number] = [0.8, 2];

/** Draws by lot the next behaviour; the one she just did is four times less likely, so she does not repeat herself. */
export function pickBehavior(random: () => number, music: boolean, last: Behavior | null): Behavior {
  const table = music ? WEIGHTS.music : WEIGHTS.calm;
  const entries = (Object.keys(table) as Behavior[]).map((k) => [k, table[k] * (k === last ? 0.25 : 1)] as const);
  let left = random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of entries) {
    left -= w;
    if (left <= 0 && w > 0) return k;
  }
  return entries.find(([, w]) => w > 0)![0];
}

export const durationOf = (kind: Behavior, random: () => number): number => DURATIONS[kind][0] + random() * (DURATIONS[kind][1] - DURATIONS[kind][0]);
