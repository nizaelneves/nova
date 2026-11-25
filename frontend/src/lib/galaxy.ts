/** Sky maths for the home-screen background. Pure functions, no drawing. */

export type EffectsQuality = 'full' | 'balanced' | 'off';

/** Small deterministic random numbers, so the sky looks the same on every start. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star {
  x: number;
  y: number;
  /** 0 = far, dim and slow; 1 = near, bright and a little faster. */
  depth: number;
  size: number;
  alpha: number;
  /** Pixels per second, to the lower left. */
  vx: number;
  vy: number;
  twinkleSpeed: number;
  phase: number;
  /** Index into the colour list used when drawing. */
  color: number;
  /** A few bright stars get a soft halo. */
  glow: boolean;
}

const COLOR_COUNT = 4; // white, light cyan, teal, and a few violet ones

/** How many stars to draw: a rich sky (about 175 on a 1024 x 768 window, 420 at most). Cheap anyway: they are tiny squares on one small canvas. */
export function starCount(width: number, height: number, quality: EffectsQuality): number {
  if (quality === 'off') return 0;
  const full = Math.min(420, Math.max(160, Math.round((width * height) / 4500)));
  return quality === 'balanced' ? Math.round(full * 0.6) : full;
}

/** Stars spread over the screen, sorted by colour so they can be drawn in groups. */
export function createStars(count: number, width: number, height: number, seed = 7): Star[] {
  const random = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const depth = random();
    const roll = random();
    const glow = roll > 0.9;
    stars.push({
      x: random() * width,
      y: random() * height,
      depth,
      size: glow ? 2 + random() * 0.7 : 1 + depth * 1.2,
      alpha: glow ? 0.7 + depth * 0.3 : Math.min(1, 0.58 + depth * 0.42),
      vx: -(4 + depth * 12),
      vy: 1.2 + depth * 3.6,
      twinkleSpeed: 0.5 + random() * 1.3,
      phase: random() * Math.PI * 2,
      color: roll < 0.5 ? 0 : roll < 0.75 ? 1 : roll < 0.9 ? 2 : COLOR_COUNT - 1,
      glow,
    });
  }
  return stars.sort((a, b) => a.color - b.color);
}

/** Where a star is at time `seconds` (it drifts to the lower left and wraps round the screen) and how bright it is. */
export function starAt(star: Star, seconds: number, width: number, height: number, out = { x: 0, y: 0, alpha: 0 }): { x: number; y: number; alpha: number } {
  // `out` lets the drawing loop reuse one object for every star: no garbage to collect 30 times a second.
  out.x = (((star.x + star.vx * seconds) % width) + width) % width;
  out.y = (((star.y + star.vy * seconds) % height) + height) % height;
  out.alpha = star.alpha * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(seconds * star.twinkleSpeed + star.phase)));
  return out;
}

/** Milliseconds between frames: 30 a second (15 on "balanced"), the same in or out of focus; the page stops only when it is hidden. */
export function frameInterval(quality: EffectsQuality): number {
  if (quality === 'off') return Infinity;
  return quality === 'balanced' ? 66 : 33;
}

export interface Shooter {
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  age: number;
  life: number;
}

/** A comet: it starts in the upper part of the sky and crosses it, down and to the left. */
export function newShooter(random: () => number, width: number, height: number): Shooter {
  const speed = 620 + random() * 260;
  const angle = Math.PI * (0.78 + random() * 0.12);
  return { x: width * (0.35 + random() * 0.6), y: height * random() * 0.45, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: 0.7 + random() * 0.4 };
}

/** Where its head is and how bright: it lights up quickly and fades out before it ends. */
export function shooterAt(s: Shooter): { x: number; y: number; alpha: number } {
  const fade = Math.min(1, s.age / 0.12) * Math.min(1, (s.life - s.age) / 0.3);
  return { x: s.x + s.vx * s.age, y: s.y + s.vy * s.age, alpha: Math.max(0, fade) };
}

/** Seconds until the next comet: by default rare, 30 to 45 seconds apart, so it stays a surprise. */
export const nextShooterDelay = (random: () => number, min = 30, max = 45): number => min + random() * (max - min);

/** The colours of a sky. Everything else (how many stars, how fast, how bright) is the same for every sky. */
export interface SkyPalette {
  /** White, light, and two accent colours: about half the stars are the first, the accents are the rarest. */
  stars: [string, string, string, string];
  /** The soft glow around the bright stars: centre, middle, edge. */
  halo: [string, string, string];
  /** The comet's tail: the clear far end and the middle. */
  tail: [string, string];
}

/** Phibe: green and cyan, with a few violet stars. */
export const PHIBE_SKY: SkyPalette = {
  stars: ['#ffffff', '#8fe3ff', '#5eead4', '#c4b5fd'],
  halo: ['rgba(143, 227, 255, 0.6)', 'rgba(94, 234, 212, 0.2)', 'rgba(20, 184, 166, 0)'],
  tail: ['rgba(94, 234, 212, 0)', 'rgba(143, 227, 255, 0.5)'],
};

/** Memoir: cyan, violet and pink. */
export const MEMOIR_SKY: SkyPalette = {
  stars: ['#ffffff', '#8fe3ff', '#c4b5fd', '#f0abfc'],
  halo: ['rgba(143, 227, 255, 0.6)', 'rgba(196, 181, 253, 0.22)', 'rgba(124, 92, 255, 0)'],
  tail: ['rgba(124, 92, 255, 0)', 'rgba(143, 227, 255, 0.5)'],
};
