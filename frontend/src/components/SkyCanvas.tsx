import { useEffect, useRef } from 'react';
import { useAppStore } from '../lib/store';
import { createStars, frameInterval, newShooter, nextShooterDelay, shooterAt, starAt, starCount, type EffectsQuality, type Shooter, type SkyPalette } from '../lib/galaxy';

const HALO = 14; // radius of the soft halo around the bright stars, in pixels
const TAIL = 150; // length of a comet's tail, in pixels

/** Soft round glow, drawn once and reused for every bright star. */
function makeHalo(palette: SkyPalette): HTMLCanvasElement {
  const size = HALO * 2;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(HALO, HALO, 0, HALO, HALO, HALO);
    gradient.addColorStop(0, palette.halo[0]);
    gradient.addColorStop(0.35, palette.halo[1]);
    gradient.addColorStop(1, palette.halo[2]);
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  return sprite;
}

/** The comet's tail, drawn once: clear at the far end, bright at the head (the right end). It is turned and stretched when used. */
function makeTail(palette: SkyPalette): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = TAIL;
  sprite.height = 4;
  const g = sprite.getContext('2d');
  if (g) {
    const gradient = g.createLinearGradient(0, 0, TAIL, 0);
    gradient.addColorStop(0, palette.tail[0]);
    gradient.addColorStop(0.7, palette.tail[1]);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
    g.fillStyle = gradient;
    g.beginPath();
    g.roundRect(0, 0.5, TAIL, 3, 1.5);
    g.fill();
  }
  return sprite;
}

/**
 * The sky behind the home screen and behind Memoir: one engine, so both look equally rich and move at the same pace, and
 * only the colours (and how often a comet crosses) are each one's own. A field of stars at different depths drifts to the
 * lower left and twinkles.
 *
 * Made to be smooth and still cost little: one canvas at one pixel per screen pixel, the stars are tiny squares drawn in
 * colour groups (the few halos and the comet's tail are reused sprites), 30 frames a second with no work in between, no
 * garbage made per frame, and nothing at all while the page is hidden. Being out of focus does not slow it. It follows the
 * "effects" setting: off draws nothing.
 */
export function SkyCanvas({ palette, cometEvery = null, seed = 7, className }: {
  palette: SkyPalette;
  /** Seconds between comets, from and to; none when left out. */
  cometEvery?: [number, number] | null;
  seed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quality: EffectsQuality = useAppStore((s) => s.settings.effects);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true, desynchronized: true }); // desynchronized: drawn without waiting for the page
    if (!canvas || !ctx || quality === 'off') return;

    const halo = makeHalo(palette);
    const tail = makeTail(palette);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const interval = frameInterval(quality);
    let stars = createStars(0, 0, 0);
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let comet: Shooter | null = null;
    const spot = { x: 0, y: 0, alpha: 0 };
    let nextComet = performance.now() / 1000 + Math.min(10, cometEvery?.[0] ?? 10);

    const draw = (seconds: number, dt = 0) => {
      ctx.clearRect(0, 0, width, height);
      let color = -1;
      for (const star of stars) {
        const p = starAt(star, seconds, width, height, spot);
        ctx.globalAlpha = p.alpha;
        if (star.glow) ctx.drawImage(halo, p.x - HALO, p.y - HALO);
        if (star.color !== color) { color = star.color; ctx.fillStyle = palette.stars[color]; } // the stars are sorted by colour
        ctx.fillRect(p.x - star.size / 2, p.y - star.size / 2, star.size, star.size);
      }
      ctx.globalAlpha = 1;
      if (!cometEvery || quality !== 'full' || dt <= 0) return;
      if (!comet && seconds > nextComet) comet = newShooter(Math.random, width, height);
      if (!comet) return;
      comet.age += dt;
      if (comet.age >= comet.life) {
        comet = null;
        nextComet = seconds + nextShooterDelay(Math.random, cometEvery[0], cometEvery[1]);
        return;
      }
      const head = shooterAt(comet);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(Math.atan2(comet.vy, comet.vx));
      ctx.globalAlpha = head.alpha;
      const length = TAIL * (0.3 + 0.7 * head.alpha); // the tail grows as it lights up and shrinks as it fades
      ctx.drawImage(tail, -length, -2, length, 4);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width; // one pixel per CSS pixel: the stars are tiny, and the canvas stays small in memory
      canvas.height = height;
      stars = createStars(starCount(width, height, quality), width, height, seed);
      draw(performance.now() / 1000);
    };

    // One animation frame at a time, skipping the ones that come too soon; the browser itself pauses it while hidden.
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < interval) return;
      const dt = Math.min(now - last, 250) / 1000; // after a pause the comet must not jump
      last = now;
      draw(now / 1000, dt);
    };
    const run = () => {
      cancelAnimationFrame(frame);
      last = performance.now();
      if (!reduceMotion.matches && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    run();
    document.addEventListener('visibilitychange', run);
    reduceMotion.addEventListener('change', run);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', run);
      reduceMotion.removeEventListener('change', run);
    };
  }, [quality, palette, cometEvery, seed]);

  return quality === 'off' ? null : <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
