import { describe, expect, it } from 'vitest';

import { createStars, frameInterval, mulberry32, starCount, starPosition } from './galaxy';

describe('star field', () => {
  it('makes the same sky every time', () => {
    expect(createStars(20, 500, 7)).toEqual(createStars(20, 500, 7));
    expect(createStars(20, 500, 7)).not.toEqual(createStars(20, 500, 8));
  });

  it('random numbers stay between 0 and 1', () => {
    const random = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('keeps every star inside the field', () => {
    for (const star of createStars(300, 400)) {
      expect(star.radius).toBeLessThanOrEqual(400);
      expect(star.size).toBeGreaterThan(0);
      expect(star.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('draws a moderate number of stars and none when effects are off', () => {
    expect(starCount(1920, 1080, 'full')).toBe(377);
    expect(starCount(3840, 2160, 'full')).toBe(380);
    expect(starCount(400, 300, 'full')).toBe(110);
    expect(starCount(1920, 1080, 'balanced')).toBeLessThan(starCount(1920, 1080, 'full'));
    expect(starCount(1920, 1080, 'off')).toBe(0);
  });

  it('slows down when the window is not in front and stops when off', () => {
    expect(frameInterval('full', true)).toBeLessThan(frameInterval('full', false));
    expect(frameInterval('balanced', true)).toBeGreaterThan(frameInterval('full', true));
    expect(frameInterval('off', true)).toBe(Infinity);
  });

  it('turns the sky slowly: a few pixels per second at most', () => {
    const [star] = createStars(1, 500);
    const a = starPosition(star, 0, 0, 0);
    const b = starPosition(star, 1, 0, 0);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(5);
  });

  it('twinkles without ever getting brighter than the star itself', () => {
    const [star] = createStars(1, 500);
    for (let t = 0; t < 30; t += 0.7) {
      const { alpha } = starPosition(star, t, 0, 0);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(star.alpha);
    }
  });
});
