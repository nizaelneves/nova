import { describe, expect, it } from 'vitest';

import { FIB, FIB_STEP, fibAt } from './voiceDraw';

describe('the Fibonacci number shown while sending', () => {
  it('counts 0, 1, 1, 2, 3, 5 and stops at 75025, never more than 5 digits', () => {
    expect(FIB.slice(0, 6)).toEqual([0, 1, 1, 2, 3, 5]);
    expect(FIB[FIB.length - 1]).toBe(75025);
    expect(Math.max(...FIB.map((n) => String(n).length))).toBe(5);
  });

  it('moves on every step and starts over from zero', () => {
    expect(fibAt(0)).toBe(0);
    expect(fibAt(FIB_STEP * 3.5)).toBe(2);
    expect(fibAt(FIB_STEP * FIB.length)).toBe(0);
    expect(fibAt(-1)).toBe(0);
  });
});
