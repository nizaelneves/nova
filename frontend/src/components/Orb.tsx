import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../lib/store';
import { getVoiceLevel } from '../lib/voiceReply';
import { FACE, easeEnergy, eyeOpenness, lookDirection } from '../lib/orb';

/** Side of the drawing box: about a quarter of the window height, between 150 and 250 pixels. */
function fitToWindow(): number {
  return Math.round(Math.min(250, Math.max(150, window.innerHeight * 0.25)));
}

/**
 * The Nova orb: a small round emoji face.
 * Idle, its eyes look to the right and to the left. While Nova speaks it looks
 * straight ahead and blinks. Click it to preview the speaking look.
 */
export function Orb({ size: fixedSize }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const effects = useAppStore((s) => s.settings.effects);
  const speaking = useAppStore((s) => s.speaking);
  const [preview, setPreview] = useState(false);
  const [autoSize, setAutoSize] = useState(() => fitToWindow());
  const targetRef = useRef(0);
  targetRef.current = speaking || preview ? 1 : 0;
  const size = fixedSize ?? autoSize;

  useEffect(() => {
    const onResize = () => setAutoSize(fitToWindow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const r = size * FACE.radius;
    const cx = size / 2;
    const cy = size / 2 - r * 0.1;
    let clock = 0; // real seconds
    let energy = 0;
    let previous = performance.now();
    let last = 0;
    let frame = 0;
    let focused = document.hasFocus();

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      // soft glow under the ball
      const sy = cy + r * 1.1;
      const shadow = ctx.createRadialGradient(cx, sy, 0, cx, sy, r * 0.9);
      shadow.addColorStop(0, 'rgba(32, 231, 170, 0.35)');
      shadow.addColorStop(1, 'rgba(32, 231, 170, 0)');
      ctx.save();
      ctx.translate(cx, sy);
      ctx.scale(1, 0.22);
      ctx.translate(-cx, -sy);
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(cx, sy, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // the ball, with the diagonal gradient of the reference emoji
      const body = ctx.createLinearGradient(cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7);
      body.addColorStop(0, '#10c3d3');
      body.addColorStop(1, '#20e7aa');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // the eyes: two white pills that slide sideways to look and squash shut to blink
      const open = eyeOpenness(clock, energy, getVoiceLevel());
      const slide = lookDirection(clock, energy) * FACE.lookRange * r;
      const w = FACE.eyeWidth * r;
      const h = Math.max(FACE.shutHeight, open * FACE.eyeHeight) * r;
      ctx.fillStyle = '#ffffff';
      for (const side of [-1, 1]) {
        const ex = cx + side * FACE.eyeSpacing * r + slide;
        const ey = cy - FACE.eyeLift * r;
        ctx.beginPath();
        ctx.roundRect(ex - w / 2, ey - h / 2, w, h, w / 2);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) {
        previous = now;
        return;
      }
      // about 30 frames per second, and far fewer when the window is behind
      const wait = !focused ? 150 : effects === 'full' ? 33 : 50;
      if (now - last < wait) return;
      const seconds = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      last = now;
      energy = easeEnergy(energy, targetRef.current, seconds);
      clock += seconds;
      draw();
    };

    const start = () => {
      cancelAnimationFrame(frame);
      previous = performance.now();
      if (!reduceMotion.matches && effects !== 'off' && !document.hidden) {
        frame = requestAnimationFrame(tick);
      }
    };
    const onFocus = () => { focused = true; };
    const onBlur = () => { focused = false; };

    draw();
    start();
    document.addEventListener('visibilitychange', start);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    reduceMotion.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      reduceMotion.removeEventListener('change', start);
    };
  }, [effects, size]);

  return (
    <div
      className="orb"
      style={{ width: size, height: size }}
      onClick={() => setPreview((p) => !p)}
      role="img"
      aria-label="Nova"
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
}
