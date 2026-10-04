import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  disintegrate,
  drawParticles,
  makeRng,
  reintegrate,
  stepAll,
  type Particle,
} from './fx/particles';

/**
 * The menu's marker bar moves like a comet: the head glides at a steady speed
 * to the new item while the tail stays behind, then runs at twice that speed
 * to catch up. The bar stretches mid-trip and shrinks back at the end.
 * (Inspired by the "Electric Nav" animation; the maths here is our own.)
 *
 * Phi's twist is "constant evolution": the part of the bar that is left behind
 * disintegrates into small Fibonacci numbers that drift away, and at the new
 * item numbers gather and re-integrate into the bar (see lib/fx/particles.ts
 * and docs/design/DESIGN.md).
 */

/** Width of the canvas the numbers fly over, in px (the bar sits at x = 1). */
export const FX_WIDTH = 150;
const DUST_PER_SECOND = 70;
const DUST_BURST = 12;
const GATHER_COUNT = 14;
const GATHER_DISTANCE = 46;
const MAX_PARTICLES = 160;
const GATHER_AT = 0.55; // fraction of the trip when the numbers start gathering


export const BAR_LENGTH = 20;
const TAIL_PEAK = 0.26; // most seconds the tail lags behind the head

/** Seconds the head takes to travel `distance` px: short hops stay snappy. */
export function travelTime(distance: number): number {
  return Math.min(0.625, Math.max(0.32, 0.32 + distance / 1200));
}

/** How long (seconds) the tail trails the head at time `t` of a trip lasting `total`. */
export function tailLag(t: number, total: number): number {
  const half = total / 2;
  const peak = Math.min(TAIL_PEAK, half);
  if (t <= half - peak) return 0;
  if (t <= half) return t - (half - peak);
  if (t <= half + peak) return half + peak - t;
  return 0;
}

export interface Span {
  top: number;
  height: number;
}

/**
 * The bar's extent at time `t` for a trip from centre `from` to centre `to`.
 * At the start and the end it is a plain BAR_LENGTH bar centred on the item.
 */
export function surgeSpan(from: number, to: number, t: number): Span {
  const distance = Math.abs(to - from);
  const total = travelTime(distance);
  if (distance === 0 || t >= total) return { top: to - BAR_LENGTH / 2, height: BAR_LENGTH };
  const dir = to > from ? 1 : -1;
  const speed = distance / total;
  const head = from + dir * speed * Math.max(0, t);
  const headEdge = head + dir * (BAR_LENGTH / 2);
  const tailEdge = head - dir * (BAR_LENGTH / 2 + speed * tailLag(Math.max(0, t), total));
  return { top: Math.min(headEdge, tailEdge), height: Math.abs(headEdge - tailEdge) };
}

function centreOf(nav: HTMLElement, path: string): number | null {
  const item = nav.querySelector<HTMLElement>(`[data-rail-path="${CSS.escape(path)}"]`);
  return item ? item.offsetTop + item.offsetHeight / 2 : null;
}

function paint(bar: HTMLElement, span: Span | null, movingDown = true) {
  if (!span) {
    bar.style.opacity = '0';
    return;
  }
  bar.style.opacity = '1';
  bar.style.transform = `translateY(${span.top}px)`;
  bar.style.height = `${span.height}px`;
  // Head end solid, tail faded: a stretched bar reads as a streak.
  bar.style.background =
    span.height > BAR_LENGTH + 1
      ? `linear-gradient(to ${movingDown ? 'top' : 'bottom'}, transparent, var(--color-accent) 65%, #fff)`
      : 'var(--color-accent)';
}

export function useRailSurge(
  navRef: RefObject<HTMLElement | null>,
  barRef: RefObject<HTMLElement | null>,
  fxRef: RefObject<HTMLCanvasElement | null>,
  activePath: string | null,
  expanded: boolean,
) {
  const frame = useRef(0);
  const centre = useRef<number | null>(null);
  const particles = useRef<Particle[]>([]);

  const clearFx = () => {
    particles.current.length = 0;
    const canvas = fxRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Place without animating whenever the menu changes shape or first appears.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar) return;
    cancelAnimationFrame(frame.current);
    clearFx();
    const c = activePath && !expanded ? centreOf(nav, activePath) : null;
    centre.current = c;
    paint(bar, c === null ? null : { top: c - BAR_LENGTH / 2, height: BAR_LENGTH });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar || expanded) return;
    const to = activePath ? centreOf(nav, activePath) : null;
    if (to === null) {
      centre.current = null;
      clearFx();
      paint(bar, null);
      return;
    }
    const from = centre.current;
    centre.current = to;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (from === null || from === to || reduce) {
      clearFx();
      paint(bar, { top: to - BAR_LENGTH / 2, height: BAR_LENGTH });
      return;
    }
    cancelAnimationFrame(frame.current);

    const canvas = fxRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas && ctx) {
      canvas.width = FX_WIDTH * ratio;
      canvas.height = nav.offsetHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    const color = getComputedStyle(bar).getPropertyValue('--color-accent').trim() || '#2dd4bf';
    const rand = makeRng(Math.floor(performance.now()) & 0xffffff);
    const list = particles.current;
    const down = to > from;
    const tailOf = (s: Span) => (down ? s.top : s.top + s.height);

    // The old bar breaks up where it stood.
    for (let i = 0; i < DUST_BURST; i++) {
      list.push(disintegrate(rand, 1, from - BAR_LENGTH / 2 + rand() * BAR_LENGTH));
    }

    const total = travelTime(Math.abs(to - from));
    const start = performance.now();
    let last = start;
    let tailBefore = tailOf(surgeSpan(from, to, 0));
    let owed = 0;
    let gathered = false;

    const step = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const span = surgeSpan(from, to, t);
      paint(bar, span, down);

      // What the tail leaves behind turns to dust.
      const tailNow = tailOf(span);
      owed += DUST_PER_SECOND * dt;
      while (owed >= 1 && list.length < MAX_PARTICLES && t < total) {
        owed -= 1;
        list.push(disintegrate(rand, 1, tailBefore + (tailNow - tailBefore) * rand()));
      }
      tailBefore = tailNow;

      // Near the end, numbers gather where the bar will settle.
      if (!gathered && t >= total * GATHER_AT) {
        gathered = true;
        for (let i = 0; i < GATHER_COUNT; i++) {
          list.push(reintegrate(rand, 1, to - BAR_LENGTH / 2 + rand() * BAR_LENGTH, GATHER_DISTANCE, rand() * 0.18));
        }
      }

      stepAll(list, dt);
      if (canvas && ctx) {
        ctx.clearRect(0, 0, FX_WIDTH, canvas.height / ratio);
        drawParticles(ctx, list, color);
      }
      if (t < total || list.length > 0) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);
}
