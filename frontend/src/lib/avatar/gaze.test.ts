import { describe, expect, it } from 'vitest';
import { gazeToward } from './gaze';

describe('gazeToward', () => {
  it('rests when the cursor is on the face', () => {
    expect(gazeToward(0, 0)).toEqual([0, 0]);
  });

  it('points exactly at the cursor and never turns past the limit', () => {
    const [x, y] = gazeToward(100000, -100000);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    expect(x).toBeCloseTo(-y);
    expect(gazeToward(100000, 0)).toEqual([1, 0]);
  });

  it('turns by degrees: a near cursor moves the eyes a little, a far one a lot', () => {
    const near = Math.hypot(...gazeToward(30, 40));
    const far = Math.hypot(...gazeToward(150, 200));
    expect(near).toBeGreaterThan(0.1);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(1);
  });
});
