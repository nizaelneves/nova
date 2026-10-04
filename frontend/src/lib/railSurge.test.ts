import { describe, expect, it } from 'vitest';
import { BAR_LENGTH, surgeSpan, tailLag, travelTime } from './railSurge';

describe('railSurge', () => {
  it('is a plain bar on the item before and after the trip', () => {
    const total = travelTime(300);
    expect(surgeSpan(100, 400, 0)).toEqual({ top: 100 - BAR_LENGTH / 2, height: BAR_LENGTH });
    expect(surgeSpan(100, 400, total)).toEqual({ top: 400 - BAR_LENGTH / 2, height: BAR_LENGTH });
  });

  it('stretches in the middle of a trip', () => {
    const total = travelTime(300);
    expect(surgeSpan(100, 400, total / 2).height).toBeGreaterThan(BAR_LENGTH * 2);
  });

  it('keeps the head ahead of the tail in both directions', () => {
    const total = travelTime(300);
    const down = surgeSpan(100, 400, total * 0.4);
    expect(down.top + down.height).toBeGreaterThan(100 + BAR_LENGTH / 2);
    const up = surgeSpan(400, 100, total * 0.4);
    expect(up.top).toBeLessThan(400 - BAR_LENGTH / 2);
  });

  it('the tail lag is zero at both ends and never negative', () => {
    const total = 0.6;
    expect(tailLag(0, total)).toBe(0);
    expect(tailLag(total, total)).toBe(0);
    for (let t = 0; t <= total; t += 0.01) expect(tailLag(t, total)).toBeGreaterThanOrEqual(0);
  });

  it('short hops are faster than long ones, within limits', () => {
    expect(travelTime(52)).toBeLessThan(travelTime(400));
    expect(travelTime(5000)).toBe(0.625);
  });
});
