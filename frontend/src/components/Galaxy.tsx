import { useEffect, useRef } from 'react';
import { useAppStore } from '../lib/store';
import {
  createStars,
  frameInterval,
  starCount,
  starPosition,
  type EffectsQuality,
} from '../lib/galaxy';

const COLORS = ['#e8e8ed', '#5eead4', '#14b8a6'];
const HALO = 18; // radius of the soft halo around bright stars, in pixels

/** Soft round glow, drawn once and reused for every bright star. */
function makeHalo(): HTMLCanvasElement {
  const size = HALO * 2;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const g = sprite.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(HALO, HALO, 0, HALO, HALO, HALO);
    gradient.addColorStop(0, 'rgba(94, 234, 212, 0.4)');
    gradient.addColorStop(0.35, 'rgba(20, 184, 166, 0.12)');
    gradient.addColorStop(1, 'rgba(20, 184, 166, 0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  return sprite;
}

/**
 * The home-screen sky: a haze in CSS plus a small canvas of slowly turning stars.
 *
 * Kept light on purpose: up to about 380 tiny stars, 30 frames per second, and
 * it slows down when the window is not in front and stops when it is hidden.
 */
export function Galaxy({ dim = false }: { dim?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quality: EffectsQuality = useAppStore((s) => s.settings.effects);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || quality === 'off') return;

    const halo = makeHalo();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stars = createStars(0, 0);
    let width = 0;
    let height = 0;
    let focused = document.hasFocus();
    let frame = 0;
    let last = 0;

    const draw = (seconds: number) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * 0.44;
      for (const star of stars) {
        const p = starPosition(star, seconds, cx, cy);
        if (p.x < -HALO || p.x > width + HALO || p.y < -HALO || p.y > height + HALO) continue;
        ctx.globalAlpha = p.alpha;
        if (star.glow) ctx.drawImage(halo, p.x - HALO, p.y - HALO);
        ctx.fillStyle = COLORS[star.color];
        ctx.fillRect(p.x - star.size / 2, p.y - star.size / 2, star.size, star.size);
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const reach = Math.hypot(width, height) / 2;
      stars = createStars(starCount(width, height, quality), reach);
      draw(performance.now() / 1000);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - last < frameInterval(quality, focused)) return;
      last = now;
      draw(now / 1000);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (!reduceMotion.matches && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const onFocus = () => { focused = true; };
    const onBlur = () => { focused = false; };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    start();
    document.addEventListener('visibilitychange', start);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    reduceMotion.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      reduceMotion.removeEventListener('change', start);
    };
  }, [quality]);

  return (
    <div className="galaxy" data-quality={quality} data-dim={dim} aria-hidden="true">
      <canvas ref={canvasRef} className="galaxy-stars" />
    </div>
  );
}
