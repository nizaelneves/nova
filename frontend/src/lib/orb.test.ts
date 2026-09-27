import { describe, expect, it } from 'vitest';

import {
  BLINK_EVERY,
  CENTER_HOLD,
  FACE,
  LEFT_HOLD,
  LOOK_PERIOD,
  RIGHT_HOLD,
  TURN,
  easeEnergy,
  eyeOpenness,
  lookDirection,
} from './orb';

describe('looking around', () => {
  const rightStart = CENTER_HOLD + TURN;
  const leftStart = CENTER_HOLD + TURN + RIGHT_HOLD + TURN + CENTER_HOLD + TURN;

  it('looks straight ahead, then right, then left, and comes back', () => {
    expect(lookDirection(0.5)).toBe(0);
    expect(lookDirection(rightStart + 1)).toBe(1);
    expect(lookDirection(leftStart + 1)).toBe(-1);
    expect(lookDirection(LOOK_PERIOD - 0.01)).toBeCloseTo(0, 1);
  });

  it('stays about 3 seconds looking to each side', () => {
    let right = 0;
    let left = 0;
    for (let t = 0; t < LOOK_PERIOD; t += 0.01) {
      const d = lookDirection(t);
      if (d === 1) right += 0.01;
      if (d === -1) left += 0.01;
    }
    expect(right).toBeGreaterThan(RIGHT_HOLD - 0.1);
    expect(right).toBeLessThan(RIGHT_HOLD + 0.1);
    expect(left).toBeGreaterThan(LEFT_HOLD - 0.1);
    expect(left).toBeLessThan(LEFT_HOLD + 0.1);
  });

  it('moves smoothly and repeats', () => {
    let previous = lookDirection(0);
    for (let t = 0.02; t < LOOK_PERIOD; t += 0.02) {
      const now = lookDirection(t);
      expect(Math.abs(now - previous)).toBeLessThan(0.1);
      previous = now;
    }
    expect(lookDirection(3.3)).toBeCloseTo(lookDirection(3.3 + LOOK_PERIOD));
  });

  it('looks straight ahead while speaking', () => {
    for (let t = 0; t < LOOK_PERIOD; t += 0.5) expect(lookDirection(t, 1)).toBeCloseTo(0);
    expect(Math.abs(lookDirection(rightStart + 1, 0.5))).toBeCloseTo(0.5);
  });
});

describe('blinking', () => {
  it('never blinks while quiet', () => {
    for (let t = 0; t < 5; t += 0.05) expect(eyeOpenness(t, 0)).toBe(1);
  });

  it('blinks over and over while speaking, opening again after each blink', () => {
    const values: number[] = [];
    for (let t = 0; t < 4; t += 0.02) values.push(eyeOpenness(t, 1));
    expect(Math.min(...values)).toBeLessThan(0.1);
    expect(Math.max(...values)).toBe(1);
    let blinks = 0;
    for (let i = 1; i < values.length; i++) if (values[i - 1] > 0.5 && values[i] <= 0.5) blinks++;
    expect(blinks).toBeGreaterThanOrEqual(4);
  });

  it('blinks a little faster when the voice is loud', () => {
    const count = (level: number) => {
      let n = 0;
      let prev = 1;
      for (let t = 0; t < 10; t += 0.01) {
        const v = eyeOpenness(t, 1, level);
        if (prev > 0.5 && v <= 0.5) n++;
        prev = v;
      }
      return n;
    };
    expect(count(1)).toBeGreaterThan(count(0));
    expect(BLINK_EVERY).toBeGreaterThan(0.5);
  });
});

describe('face', () => {
  it('keeps the eyes inside the ball when looking aside', () => {
    const farthest = FACE.eyeSpacing + FACE.lookRange + FACE.eyeWidth / 2;
    expect(farthest).toBeLessThan(0.95);
  });

  it('fits in its box with room for the glow underneath', () => {
    expect(FACE.radius * 2.4).toBeLessThan(1);
  });

  it('eases toward the target, rising faster than falling', () => {
    const up = easeEnergy(0, 1, 0.1);
    const down = 1 - easeEnergy(1, 0, 0.1);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(1);
    expect(up).toBeGreaterThan(down);
    expect(easeEnergy(1, 1, 0.5)).toBeCloseTo(1);
  });
});
