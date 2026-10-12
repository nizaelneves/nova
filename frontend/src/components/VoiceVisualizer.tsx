import { useEffect, useRef } from 'react';
import { useAppStore } from '../lib/store';
import { getVoiceLevel } from '../lib/voiceReply';
import { barHeights } from '../lib/voiceBars';

const BARS = 48;
const BAR_WIDTH = 3;
const GAP = 3;
const WIDTH = BARS * (BAR_WIDTH + GAP) - GAP;
const HEIGHT = 40;

/**
 * "Speaking" label over a row of bars that move with Phibe's voice (a
 * voice-reactive audio visualizer). Fades in while Phibe talks and rests as a
 * thin line otherwise. With effects off, or reduced motion, the bars stay still.
 */
export function VoiceVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speaking = useAppStore((s) => s.speaking);
  const effects = useAppStore((s) => s.settings.effects);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animated = !reduceMotion.matches && effects !== 'off';
    let frame = 0;
    let level = 0; // smoothed so the bars swell and settle instead of flickering
    let last = 0;
    const startedAt = performance.now();

    const draw = (heights: number[]) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const fill = ctx.createLinearGradient(0, 0, WIDTH, 0);
      fill.addColorStop(0, '#10c3d3');
      fill.addColorStop(1, '#20e7aa');
      ctx.fillStyle = fill;
      heights.forEach((h, i) => {
        const barHeight = Math.max(2, h * HEIGHT);
        ctx.beginPath();
        ctx.roundRect(i * (BAR_WIDTH + GAP), (HEIGHT - barHeight) / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
        ctx.fill();
      });
    };

    if (!animated) {
      draw(barHeights(BARS, speakingRef.current ? 0.35 : 0, 0));
      return;
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < 33) return;
      last = now;
      const target = speakingRef.current ? getVoiceLevel() : 0;
      level += (target - level) * (target > level ? 0.5 : 0.15);
      draw(barHeights(BARS, level, (now - startedAt) / 1000));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [effects]);

  return (
    <div
      className="flex flex-col items-center gap-3 pointer-events-none select-none"
      style={{ opacity: speaking ? 1 : 0, transition: 'opacity 0.4s ease' }}
      aria-hidden={!speaking}
    >
      <span
        className="text-xs font-medium uppercase"
        style={{
          letterSpacing: '0.4em',
          paddingLeft: '0.4em',
          color: 'var(--color-accent-light)',
          textShadow: '0 0 14px rgba(32, 231, 170, 0.5)',
        }}
      >
        Speaking
      </span>
      <canvas ref={canvasRef} style={{ width: WIDTH, height: HEIGHT }} />
    </div>
  );
}
