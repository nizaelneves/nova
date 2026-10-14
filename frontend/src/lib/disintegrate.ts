const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DURATION = 610; // a Fibonacci number of milliseconds

/**
 * Turns an element into a burst of dots and lets it drift away: the dots start where
 * the element was, laid out on the golden angle (the sunflower pattern). The element is
 * hidden at once; the promise resolves when the dots are gone, so the caller can
 * remove it from the list then. With "reduce motion" on, it resolves immediately.
 */
export function disintegrate(el: HTMLElement | null | undefined, color = '#20e7aa'): Promise<void> {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();

  const box = el.getBoundingClientRect();
  const pad = 90;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = (box.width + pad * 2) * dpr;
  canvas.height = (box.height + pad * 2) * dpr;
  Object.assign(canvas.style, {
    position: 'fixed', left: `${box.left - pad}px`, top: `${box.top - pad}px`,
    width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`,
    pointerEvents: 'none', zIndex: '300',
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve();
  document.body.appendChild(canvas);

  const count = Math.max(40, Math.min(160, Math.round((box.width * box.height) / 450)));
  const cx = pad + box.width / 2;
  const cy = pad + box.height / 2;
  const dots = Array.from({ length: count }, (_, i) => {
    const angle = i * GOLDEN_ANGLE;
    const u = Math.sqrt((i + 0.5) / count);
    const x = cx + Math.cos(angle) * u * box.width * 0.5 * 1.15;
    const y = cy + Math.sin(angle) * u * box.height * 0.5 * 1.15;
    const away = Math.atan2(y - cy, x - cx);
    const speed = 30 + Math.random() * 70; // px over the whole animation
    return {
      x: Math.min(pad + box.width, Math.max(pad, x)), y: Math.min(pad + box.height, Math.max(pad, y)),
      vx: Math.cos(away) * speed + (Math.random() - 0.5) * 24,
      vy: Math.sin(away) * speed - 26 - Math.random() * 30, // they drift up a little
      r: 1.2 + Math.random() * 2.2,
      tint: i % 4 === 0 ? color : '#ffffff',
      late: (i / count) * 0.35, // dots on the outside leave later
    };
  });

  el.style.transition = 'opacity 144ms ease';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / DURATION);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dots) {
        const t = Math.max(0, Math.min(1, (k - d.late) / (1 - d.late)));
        const e = 1 - Math.pow(1 - t, 2);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.fillStyle = d.tint;
        ctx.beginPath();
        ctx.arc((d.x + d.vx * e) * dpr, (d.y + d.vy * e) * dpr, d.r * (1 - t * 0.5) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (k < 1) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
