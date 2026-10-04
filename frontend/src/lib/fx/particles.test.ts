import { describe, expect, it } from 'vitest';
import {
  FIBONACCI,
  alphaOf,
  disintegrate,
  makeRng,
  pickFibonacci,
  reintegrate,
  stepAll,
  stepParticle,
} from './particles';

describe('particles', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('only ever draws Fibonacci numbers, mostly small ones', () => {
    const rand = makeRng(1);
    const picks = Array.from({ length: 400 }, () => pickFibonacci(rand));
    expect(picks.every((n) => (FIBONACCI as readonly number[]).includes(n))).toBe(true);
    const small = picks.filter((n) => n <= 5).length;
    expect(small).toBeGreaterThan(picks.length / 2);
  });

  it('dust drifts to the right and fades away', () => {
    const p = disintegrate(makeRng(3), 10, 100);
    const startAlpha = alphaOf(p);
    for (let i = 0; i < 20; i++) stepParticle(p, 0.02);
    expect(p.x).toBeGreaterThan(10);
    expect(alphaOf(p)).toBeLessThan(startAlpha);
  });

  it('gathering particles land exactly on their target', () => {
    const p = reintegrate(makeRng(5), 1, 50, 40);
    expect(p.x).not.toBe(1);
    stepParticle(p, p.life);
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('a delayed particle waits before it moves and shows nothing', () => {
    const p = reintegrate(makeRng(9), 1, 50, 40, 0.3);
    const x0 = p.x;
    stepParticle(p, 0.1);
    expect(p.x).toBe(x0);
    expect(alphaOf(p)).toBe(0);
  });

  it('removes particles once their life is over', () => {
    const list = [disintegrate(makeRng(2), 0, 0), reintegrate(makeRng(4), 0, 0, 30)];
    stepAll(list, 5);
    expect(list).toHaveLength(0);
  });
});
