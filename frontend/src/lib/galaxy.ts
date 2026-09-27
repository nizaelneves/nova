/** Star field maths for the home-screen background. Pure functions, no drawing. */

export type EffectsQuality = 'full' | 'balanced' | 'off';

export interface Star {
  /** Position around the centre of the field, in radians. */
  angle: number;
  /** Distance from the centre, in pixels. */
  radius: number;
  /** 0 = far and slow, 1 = near and a little faster. */
  depth: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
  /** Index into the colour list used when drawing. */
  color: number;
  /** A few bright stars get a soft halo. */
  glow: boolean;
}

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

/** How many stars to draw: enough to feel like a sky, few enough to stay cheap. */
export function starCount(width: number, height: number, quality: EffectsQuality): number {
  if (quality === 'off') return 0;
  const base = Math.round((width * height) / 5500);
  const clamped = Math.min(380, Math.max(110, base));
  return quality === 'balanced' ? Math.round(clamped * 0.6) : clamped;
}

/** Milliseconds between frames. Slower when the window is not in front. */
export function frameInterval(quality: EffectsQuality, focused: boolean): number {
  if (quality === 'off') return Infinity;
  if (quality === 'balanced') return focused ? 66 : 200;
  return focused ? 33 : 120;
}

const COLOR_COUNT = 3; // white, light teal, teal

export function createStars(count: number, maxRadius: number, seed = 7): Star[] {
  const random = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const depth = random();
    const roll = random();
    const glow = roll > 0.9;
    stars.push({
      angle: random() * Math.PI * 2,
      // sqrt keeps the stars evenly spread over the disc instead of bunched at the centre
      radius: Math.sqrt(random()) * maxRadius,
      depth,
      size: glow ? 1.4 + random() * 0.6 : 0.6 + depth * 1.0,
      // the larger stars are toned down so they never compete with the interface
      alpha: glow ? 0.34 + depth * 0.2 : Math.min(1, 0.38 + depth * 0.62),
      twinkleSpeed: 0.4 + random() * 1.4,
      phase: random() * Math.PI * 2,
      color: roll < 0.7 ? 0 : roll < 0.9 ? 1 : Math.min(2, COLOR_COUNT - 1),
      glow,
    });
  }
  return stars;
}

/** Gentle rotation of the whole sky, in radians per second (a full turn in about 25 minutes). */
export const SKY_TURN_SPEED = 0.004;

/** Where a star is drawn at time `seconds`. The sky turns slowly; nearer stars turn a little faster. */
export function starPosition(
  star: Star,
  seconds: number,
  centerX: number,
  centerY: number,
): { x: number; y: number; alpha: number } {
  const angle = star.angle + seconds * SKY_TURN_SPEED * (0.4 + star.depth);
  const twinkle = 0.72 + 0.28 * Math.sin(seconds * star.twinkleSpeed + star.phase);
  return {
    x: centerX + Math.cos(angle) * star.radius,
    // slightly flattened, so the turning sky reads as a galaxy plane
    y: centerY + Math.sin(angle) * star.radius * 0.88,
    alpha: star.alpha * twinkle,
  };
}
