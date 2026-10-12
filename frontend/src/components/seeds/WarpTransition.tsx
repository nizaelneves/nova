import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 137.5 degrees
const STARS = 520;
const SWAP_AT = 0.55; // share of the animation at which the screen is fully covered

/**
 * Flying into space "in Fibonacci mode": stars sit on the sunflower pattern
 * (golden angle) and rush outward while a golden spiral zooms past.
 * `onSwap` fires once the screen is covered, so the new view can appear
 * underneath; `onDone` when the animation is over.
 */
export function WarpTransition({ color, reverse, onSwap, onDone }: {
  color: string;
  reverse: boolean;
  onSwap: () => void;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onSwap();
      onDone();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (cv.width = window.innerWidth * dpr);
    const h = (cv.height = window.innerHeight * dpr);
    const cx = w / 2;
    const cy = h / 2;
    const reach = Math.hypot(cx, cy);
    const duration = reverse ? 800 : 1150;
    const start = performance.now();
    let swapped = false;
    let raf = 0;

    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const move = reverse ? 1 - k : k;
      const cover = k < SWAP_AT ? ease(k / SWAP_AT) : 1 - ease((k - SWAP_AT) / (1 - SWAP_AT));
      const zoom = Math.pow(move, 2.2) * 14;
      const trail = Math.max(0, zoom - 1.2);
      const turn = move * 1.4;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(3, 4, 10, ${cover})`;
      ctx.fillRect(0, 0, w, h);

      ctx.lineCap = 'round';
      for (let i = 0; i < STARS; i++) {
        const a = i * GOLDEN_ANGLE + turn;
        const u = Math.sqrt((i + 0.5) / STARS);
        const far = u * reach * (1 + zoom);
        const near = u * reach * (1 + trail);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        ctx.strokeStyle = i % 5 === 0 ? color : '#ffffff';
        ctx.globalAlpha = Math.min(1, far / reach) * 0.85;
        ctx.lineWidth = (0.6 + u * 1.8) * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + cos * near, cy + sin * near);
        ctx.lineTo(cx + cos * far, cy + sin * far);
        ctx.stroke();
      }

      // the golden spiral: turning it by d and scaling it by PHI^(2d/pi) maps it onto itself
      const turned = move * Math.PI * 3.2;
      const scale = Math.pow(PHI, (2 * turned) / Math.PI);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(turned);
      ctx.scale(scale, scale);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7 * Math.sin(k * Math.PI);
      ctx.lineWidth = (2.2 * dpr) / scale;
      ctx.beginPath();
      for (let t = 0; t <= Math.PI * 7; t += 0.08) {
        const r = 1.2 * dpr * Math.pow(PHI, (2 * t) / Math.PI);
        ctx[t === 0 ? 'moveTo' : 'lineTo'](Math.cos(t) * r, Math.sin(t) * r);
      }
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;

      if (!swapped && k >= SWAP_AT) {
        swapped = true;
        onSwap();
      }
      if (k < 1) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // the animation runs once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(<canvas ref={canvas} className="seeds-warp" aria-hidden="true" />, document.body);
}

const ease = (x: number) => x * x * (3 - 2 * x);
