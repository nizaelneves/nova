import { describe, expect, it } from 'vitest';

import { DURATIONS, PHASE_START, durationOf, phaseOf, pickBehavior, sleepEnv, type Behavior } from './phibeIdle';

const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

describe('the phases of being alone', () => {
  it('follow the time without activity', () => {
    expect(phaseOf(0)).toBe('active');
    expect(phaseOf(PHASE_START.ociosa - 0.1)).toBe('active');
    expect(phaseOf(PHASE_START.ociosa)).toBe('ociosa');
    expect(phaseOf(PHASE_START.sonolenta)).toBe('sonolenta');
    expect(phaseOf(PHASE_START.dormindo)).toBe('dormindo');
    expect(phaseOf(PHASE_START.profundo)).toBe('profundo');
    expect(phaseOf(99999)).toBe('profundo');
  });

  it('go from awake to deep sleep without ever stepping back', () => {
    let before = sleepEnv(0);
    for (let t = 1; t < 400; t++) {
      const e = sleepEnv(t);
      expect(e.drowsy).toBeGreaterThanOrEqual(before.drowsy);
      expect(e.deep).toBeGreaterThanOrEqual(before.deep);
      before = e;
    }
    expect(sleepEnv(0)).toEqual({ oc: 0, drowsy: 0, yawn: 0, asleep: 0, shake: 0, deep: 0 });
    expect(sleepEnv(PHASE_START.profundo + 10).deep).toBe(1);
    expect(sleepEnv(PHASE_START.profundo + 10).asleep).toBe(1);
    expect(sleepEnv(30).oc).toBe(1); // alone and awake: free to look around
    expect(sleepEnv(PHASE_START.sonolenta + 5).oc).toBe(0); // sleepy: the games are over
  });
});

describe('what she does by lot', () => {
  it('never hums or dances without music', () => {
    const random = lcg(1);
    let last: Behavior | null = null;
    for (let i = 0; i < 2000; i++) {
      last = pickBehavior(random, false, last);
      expect(['hum', 'dance']).not.toContain(last);
    }
  });

  it('hums and dances with music, and still looks around the most of the quiet ones', () => {
    const random = lcg(2);
    const seen = new Map<Behavior, number>();
    for (let i = 0; i < 4000; i++) {
      const k = pickBehavior(random, true, null);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    for (const k of ['hum', 'dance', 'look', 'bubbles', 'star'] as Behavior[]) expect(seen.get(k) ?? 0).toBeGreaterThan(0);
    expect(seen.get('hum')!).toBeGreaterThan(seen.get('bubbles')!);
  });

  it('does not repeat itself as often', () => {
    const random = lcg(3);
    let same = 0;
    let last: Behavior | null = null;
    for (let i = 0; i < 4000; i++) {
      const k = pickBehavior(random, false, last);
      if (k === last) same++;
      last = k;
    }
    expect(same / 4000).toBeLessThan(0.25); // a third of the time would be the plain odds for the most likely one
  });

  it('each behaviour lasts within its range', () => {
    const random = lcg(4);
    for (const k of Object.keys(DURATIONS) as Behavior[]) {
      for (let i = 0; i < 50; i++) {
        const d = durationOf(k, random);
        expect(d).toBeGreaterThanOrEqual(DURATIONS[k][0]);
        expect(d).toBeLessThan(DURATIONS[k][1]);
      }
    }
  });
});
