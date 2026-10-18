import { describe, expect, it } from 'vitest';
import { barHeights, bodyVisibility, paceOf } from './orbMotion';

describe('orb motion', () => {
  it('keeps the usual pace, and moves faster when thinking', () => {
    expect(paceOf('idle')).toBe(1);
    expect(paceOf('speaking')).toBe(1);
    expect(paceOf('thinking')).toBeLessThan(paceOf('listening'));
    expect(paceOf('listening')).toBeLessThan(1);
  });

  it('draws 22 bars that stay inside the circle and never vanish', () => {
    const bars = barHeights(1, 0.3);
    expect(bars).toHaveLength(22);
    for (const b of bars) {
      expect(b.h).toBeGreaterThanOrEqual(8);
      expect(b.h).toBeLessThanOrEqual(2 * Math.sqrt(112 * 112 - b.x * b.x) * 0.98 + 1e-6);
    }
    expect(Math.min(...bars.map((b) => b.x))).toBeCloseTo(-104);
  });

  it('is quiet when the voice is quiet and loud when it is loud', () => {
    const sum = (level: number) => barHeights(level, 1.1).reduce((n, b) => n + b.h, 0);
    expect(sum(0)).toBeLessThan(sum(1));
    expect(barHeights(5, 0)).toEqual(barHeights(1, 0));
  });

  it('shows the body until the dissolve is most of the way', () => {
    expect(bodyVisibility(0)).toBe(1);
    expect(bodyVisibility(0.4)).toBeCloseTo(0.5);
    expect(bodyVisibility(0.8)).toBe(0);
    expect(bodyVisibility(1)).toBe(0);
  });
});
