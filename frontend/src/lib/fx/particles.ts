/**
 * Phi's particle toolkit: the shared base for "constant evolution" effects.
 *
 * Idea: something never just disappears or appears. It disintegrates into small
 * Fibonacci numbers (1, 1, 2, 3, 5, 8, ...) that drift away like dust in the
 * wind, and it re-integrates from numbers that converge into place.
 *
 * Everything here is pure (no DOM, no clock, no Math.random) so it can be unit
 * tested and reused by any canvas effect. See docs/design/DESIGN.md.
 */

export const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;

/** Small, deterministic random numbers in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Fibonacci number, favouring the small ones (as in nature, small is common). */
export function pickFibonacci(rand: () => number): number {
  const index = Math.floor(rand() * rand() * FIBONACCI.length);
  return FIBONACCI[index];
}

export type ParticleMode = 'out' | 'in';

export interface Particle {
  mode: ParticleMode;
  /** The number drawn for this particle. */
  value: number;
  /** Seconds lived. Negative means "not born yet" (a staggered start). */
  age: number;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 'in' particles travel from (sx, sy) to (tx, ty). */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  size: number;
}

export interface Wind {
  /** Direction the dust drifts, in radians (0 = right, -PI/2 = up). */
  angle: number;
  /** Typical speed in px per second. */
  speed: number;
}

/** Dust drifting to the right and a little upward, as in the "dissolving" references. */
export const DEFAULT_WIND: Wind = { angle: -0.45, speed: 70 };

const blank = (mode: ParticleMode): Particle => ({
  mode, value: 1, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, sx: 0, sy: 0, tx: 0, ty: 0, size: 9,
});

/** One particle breaking off a surface at (x, y). */
export function disintegrate(rand: () => number, x: number, y: number, wind: Wind = DEFAULT_WIND): Particle {
  const p = blank('out');
  const spread = (rand() - 0.5) * 1.1;
  const speed = wind.speed * (0.35 + rand() * 0.9);
  p.value = pickFibonacci(rand);
  p.x = x;
  p.y = y;
  p.vx = Math.cos(wind.angle + spread) * speed;
  p.vy = Math.sin(wind.angle + spread) * speed;
  p.life = 0.55 + rand() * 0.6;
  p.size = 8 + Math.floor(rand() * 4);
  return p;
}

/**
 * One particle that gathers into the point (tx, ty). It starts `distance` px
 * away, up-wind of the target, and may wait `delay` seconds before moving.
 */
export function reintegrate(
  rand: () => number,
  tx: number,
  ty: number,
  distance: number,
  delay = 0,
  wind: Wind = DEFAULT_WIND,
): Particle {
  const p = blank('in');
  const spread = (rand() - 0.5) * 1.3;
  const d = distance * (0.5 + rand() * 0.7);
  p.value = pickFibonacci(rand);
  p.tx = tx;
  p.ty = ty;
  p.sx = tx + Math.cos(wind.angle + spread) * d;
  p.sy = ty + Math.sin(wind.angle + spread) * d;
  p.x = p.sx;
  p.y = p.sy;
  p.life = 0.38 + rand() * 0.25;
  p.age = -delay;
  p.size = 8 + Math.floor(rand() * 4);
  return p;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function stepParticle(p: Particle, dt: number): void {
  p.age += dt;
  if (p.age < 0) return;
  if (p.mode === 'out') {
    const drag = Math.exp(-1.6 * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  } else {
    const k = easeInOut(Math.min(1, p.age / p.life));
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k;
  }
}

export const isAlive = (p: Particle): boolean => p.age < p.life;

/** 0 to 1. Dust fades as it flies away; gathering numbers fade in, then melt into the surface. */
export function alphaOf(p: Particle): number {
  if (p.age < 0 || p.age >= p.life) return 0;
  const t = p.age / p.life;
  if (p.mode === 'out') return Math.pow(1 - t, 1.5);
  return Math.min(1, t * 4) * (1 - Math.pow(t, 6));
}

/** Moves every particle and drops the dead ones, in place. */
export function stepAll(list: Particle[], dt: number): void {
  for (const p of list) stepParticle(p, dt);
  for (let i = list.length - 1; i >= 0; i--) if (!isAlive(list[i])) list.splice(i, 1);
}

/** Draws the numbers. The caller owns the canvas, its scale and the colour. */
export function drawParticles(ctx: CanvasRenderingContext2D, list: readonly Particle[], color: string): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  let font = 0;
  for (const p of list) {
    const a = alphaOf(p);
    if (a <= 0.01) continue;
    if (p.size !== font) {
      font = p.size;
      ctx.font = `600 ${font}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
    }
    ctx.globalAlpha = a;
    ctx.fillText(String(p.value), p.x, p.y);
  }
  ctx.globalAlpha = 1;
}
