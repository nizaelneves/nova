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
 * Phibe's twist is "constant evolution": the part of the bar that is left behind
 * disintegrates into small Fibonacci numbers that drift away, and at the new
 * item numbers gather and re-integrate into the bar (see lib/fx/particles.ts
 * and docs/design/DESIGN.md).
 */

/** Width of the canvas the numbers fly over, in px (the bar sits at x = 1). */
export const FX_WIDTH = 150;
const MAX_PIXELS = 90;
const GATHER_DISTANCE = 40;


export const BAR_LENGTH = 20;
const TAIL_PEAK = 0.1; // most seconds the tail lags behind the head

/**
 * Seconds the head takes to travel `distance` px. The screen changes instantly when a
 * section is clicked, so the bar keeps pace with it: a quick streak, never a slow glide.
 */
export function travelTime(distance: number): number {
  return Math.min(0.24, Math.max(0.14, 0.14 + distance / 3000));
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

interface Span {
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

    const total = travelTime(Math.abs(to - from));
    const pixels = Math.min(MAX_PIXELS, Math.round(14 + Math.abs(to - from) / 5));
    const numbers = Math.round(pixels / 5);

    // The old bar and the stretch it crosses break into pixels and a few numbers; the tail
    // leaves them behind as it passes (later along the trip means born later).
    for (let i = 0; i < pixels + numbers; i++) {
      const u = i < 6 ? 0 : rand();
      const y = from + (to - from) * u + (rand() - 0.5) * BAR_LENGTH;
      const glyph = i < pixels ? 'px' : 'num';
      list.push(disintegrate(rand, 1 + rand() * 3, y, undefined, glyph, u * total * 0.8));
    }
    // At the new item pixels and numbers gather and fuse into the bar as the head lands.
    for (let i = 0; i < pixels + numbers; i++) {
      const y = to - BAR_LENGTH / 2 + rand() * BAR_LENGTH;
      const glyph = i < pixels ? 'px' : 'num';
      list.push(reintegrate(rand, 1, y, GATHER_DISTANCE, total * 0.35 + rand() * total * 0.3, undefined, glyph));
    }

    const start = performance.now();
    let last = start;

    const step = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      paint(bar, surgeSpan(from, to, t), down);
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
