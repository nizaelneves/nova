import { describe, expect, it } from 'vitest';

import { MEMOIR_SKY, PHIBE_SKY, createStars, frameInterval, mulberry32, newShooter, nextShooterDelay, shooterAt, starAt, starCount } from './galaxy';

describe('star field', () => {
  it('makes the same sky every time', () => {
    expect(createStars(20, 800, 600, 7)).toEqual(createStars(20, 800, 600, 7));
    expect(createStars(20, 800, 600, 7)).not.toEqual(createStars(20, 800, 600, 8));
  });

  it('random numbers stay between 0 and 1', () => {
    const random = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('draws a rich sky that grows with the screen up to a cap', () => {
    expect(starCount(1024, 768, 'full')).toBeGreaterThanOrEqual(150);
    expect(starCount(3840, 2160, 'full')).toBe(360);
    expect(starCount(400, 300, 'full')).toBe(150);
    expect(starCount(1920, 1080, 'balanced')).toBeLessThan(starCount(1920, 1080, 'full'));
    expect(starCount(1920, 1080, 'off')).toBe(0);
  });

  it('keeps every star on the screen at every moment, drifting to the lower left', () => {
    const stars = createStars(120, 1000, 700);
    for (const star of stars) {
      expect(star.vx).toBeLessThan(0);
      expect(star.vy).toBeGreaterThan(0);
      for (let s = 0; s < 5000; s += 313) {
        const p = starAt(star, s, 1000, 700);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(1000);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(700);
        expect(p.alpha).toBeGreaterThan(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('drifts gently: under 20 pixels a second, and the near stars a little faster than the far ones', () => {
    const stars = createStars(200, 1000, 700);
    const speed = (s: (typeof stars)[number]) => Math.hypot(s.vx, s.vy);
    expect(Math.max(...stars.map(speed))).toBeLessThan(20);
    const far = stars.filter((s) => s.depth < 0.2).map(speed);
    const near = stars.filter((s) => s.depth > 0.8).map(speed);
    expect(Math.min(...near)).toBeGreaterThan(Math.max(...far));
  });

  it('sorts the stars by colour, so they can be drawn in groups', () => {
    const colors = createStars(100, 800, 600).map((s) => s.color);
    expect(colors).toEqual([...colors].sort((a, b) => a - b));
  });

  it('redraws 30 times a second (15 on balanced) and never when off', () => {
    expect(frameInterval('full')).toBeLessThanOrEqual(34);
    expect(frameInterval('balanced')).toBeGreaterThan(frameInterval('full'));
    expect(frameInterval('off')).toBe(Infinity);
  });

  it('a comet crosses the sky down and to the left, lights up and fades', () => {
    const comet = newShooter(mulberry32(3), 1000, 600);
    expect(comet.vx).toBeLessThan(0);
    expect(comet.vy).toBeGreaterThan(0);
    const start = shooterAt(comet);
    const mid = shooterAt({ ...comet, age: comet.life / 2 });
    const end = shooterAt({ ...comet, age: comet.life });
    expect(start.alpha).toBe(0);
    expect(mid.alpha).toBeGreaterThan(0.9);
    expect(end.alpha).toBe(0);
    expect(mid.x).toBeLessThan(start.x);
    expect(mid.y).toBeGreaterThan(start.y);
  });

  it('a comet comes rarely: 30 to 45 seconds apart', () => {
    const random = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const wait = nextShooterDelay(random);
      expect(wait).toBeGreaterThanOrEqual(30);
      expect(wait).toBeLessThan(45);
    }
  });

  it('a sky can ask for its own comet pace', () => {
    const random = mulberry32(9);
    for (let i = 0; i < 100; i++) {
      const wait = nextShooterDelay(random, 5, 11);
      expect(wait).toBeGreaterThanOrEqual(5);
      expect(wait).toBeLessThan(11);
    }
  });

  it('Phibe and Memoir skies share everything but the colours', () => {
    for (const sky of [PHIBE_SKY, MEMOIR_SKY]) {
      expect(sky.stars).toHaveLength(4);
      expect(sky.stars[0]).toBe('#ffffff');
      expect(sky.halo).toHaveLength(3);
    }
    expect(PHIBE_SKY.stars).not.toEqual(MEMOIR_SKY.stars);
  });
});
