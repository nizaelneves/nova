import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../lib/store';
import { getVoiceLevel } from '../lib/voiceReply';
import { gazeToward } from '../lib/avatar/gaze';
import { useVoiceEvents } from '../voice/VoiceCard';

type IslandState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done';

const LABEL: Record<IslandState, string> = { idle: '', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', done: '' };
// How far the eyes (and, a little, the face) travel at full turn, in drawing units.
const TRAVEL = { eyeX: 5.2, eyeY: 3.8, faceX: 2.2, faceY: 1.7 };
// Mist pace and strength by state.
const MIST: Record<IslandState, { speed: number; op: number }> = {
  idle: { speed: 1, op: 0.8 },
  listening: { speed: 1.7, op: 1 },
  thinking: { speed: 2.6, op: 0.95 },
  speaking: { speed: 1.4, op: 1 },
  done: { speed: 1.2, op: 1 },
};
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Phibe's island: the Orb's face in a small black pill attached to the top edge of the app,
 * centred, like the island of Coucou. It lives inside the Phibe window only. The eyes follow the
 * cursor right away (no animation delay, only a light smoothing over a couple of frames), and the
 * pill widens to say what Phibe is doing.
 */
export function Island() {
  const effects = useAppStore((s) => s.settings.effects);
  const speaking = useAppStore((s) => s.speaking);
  const thinking = useAppStore((s) => s.streamState.isStreaming);
  const { state: voice } = useVoiceEvents();
  const [blink, setBlink] = useState(false);
  const [happy, setHappy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const faceRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const glowRef = useRef<SVGGElement>(null);
  const target = useRef<[number, number]>([0, 0]);
  const current = useRef<[number, number]>([0, 0]);
  const raf = useRef(0);
  const lastMove = useRef(0);

  const listening = voice.phase === 'listening' || voice.phase === 'countdown';
  const state: IslandState = happy ? 'done' : listening ? 'listening' : speaking ? 'speaking' : thinking ? 'thinking' : 'idle';

  // Draw the current gaze straight into the DOM: no React render per mouse move.
  const draw = () => {
    const [gx, gy] = current.current;
    eyesRef.current?.setAttribute('transform', `translate(${(gx * TRAVEL.eyeX).toFixed(2)} ${(gy * TRAVEL.eyeY).toFixed(2)})`);
    faceRef.current?.style.setProperty('--fx', `${(gx * TRAVEL.faceX).toFixed(2)}px`);
    faceRef.current?.style.setProperty('--fy', `${(gy * TRAVEL.faceY).toFixed(2)}px`);
  };

  const run = () => {
    if (raf.current) return;
    const step = () => {
      const [tx, ty] = target.current;
      const [cx, cy] = current.current;
      const k = 0.55; // close most of the gap each frame: fast, still a little soft
      current.current = [cx + (tx - cx) * k, cy + (ty - cy) * k];
      draw();
      raf.current = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.004 ? requestAnimationFrame(step) : 0;
    };
    raf.current = requestAnimationFrame(step);
  };

  // The eyes follow the cursor over the whole window; when it rests, they glance around.
  useEffect(() => {
    if (effects === 'off') return;
    const onMove = (e: PointerEvent) => {
      const r = faceRef.current?.getBoundingClientRect();
      if (!r) return;
      target.current = gazeToward(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      lastMove.current = performance.now();
      run();
    };
    const onLeave = () => {
      target.current = [0, 0.2];
      run();
    };
    const wander = window.setInterval(() => {
      if (performance.now() - lastMove.current > 3000) {
        target.current = [[-1, -0.4, 0.6, 1][Math.floor(Math.random() * 4)] * 0.8, rand(-0.3, 0.3)];
        run();
      }
    }, 3200);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.clearInterval(wander);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [effects]);

  // The mist stops when the window is hidden or not focused.
  useEffect(() => {
    const apply = () => setHidden(document.hidden || !document.hasFocus());
    apply();
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('focus', apply);
    window.addEventListener('blur', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      window.removeEventListener('focus', apply);
      window.removeEventListener('blur', apply);
    };
  }, []);

  // Random blinks, sometimes two in a row.
  useEffect(() => {
    if (effects === 'off') return;
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 120);
        if (Math.random() < 0.22) {
          window.setTimeout(() => setBlink(true), 240);
          window.setTimeout(() => setBlink(false), 360);
        }
        loop();
      }, rand(2200, 5400));
    };
    loop();
    return () => window.clearTimeout(t);
  }, [effects]);

  // While speaking, the glow of the eyes follows the voice.
  useEffect(() => {
    if (state !== 'speaking') {
      glowRef.current?.setAttribute('opacity', '0.5');
      return;
    }
    const id = window.setInterval(() => glowRef.current?.setAttribute('opacity', String(0.5 + Math.min(1, getVoiceLevel() * 1.8) * 0.5)), 60);
    return () => window.clearInterval(id);
  }, [state]);

  const shut = blink && !happy;
  const eye = (cx: number) =>
    happy ? (
      <path key={cx} d={`M${cx - 2.6} 0.8Q${cx} -2.4 ${cx + 2.6} 0.8`} fill="none" stroke="#bff8f3" strokeWidth="1.5" strokeLinecap="round" />
    ) : shut ? (
      <path key={cx} d={`M${cx - 2.4} 0Q${cx} 1.6 ${cx + 2.4} 0`} fill="none" stroke="#bff8f3" strokeWidth="1.5" strokeLinecap="round" />
    ) : (
      <g key={cx}>
        <ellipse cx={cx} cy="0" rx="2.4" ry="3.5" fill="url(#isl-eye)" />
        <ellipse cx={cx - 0.7} cy="-1.2" rx="0.8" ry="1.1" fill="#fff" fillOpacity=".9" />
      </g>
    );

  const wide = LABEL[state] !== '';
  const mist = MIST[state];
  const still = effects === 'off' || hidden;
  return (
    <div
      className={`phibe-island${still ? ' is-still' : ''}`}
      style={{ width: wide ? 330 : 240, ['--mist-speed' as string]: mist.speed, ['--mist-op' as string]: mist.op }}
      onClick={() => {
        setHappy(true);
        window.setTimeout(() => setHappy(false), 1400);
      }}
      role="img"
      aria-label={wide ? `Phibe: ${LABEL[state]}` : 'Phibe'}
    >
      <div className="phibe-island-inner">
        <div className="phibe-island-facebox">
          <div className="phibe-mist-wrap" aria-hidden="true">
            <svg className="phibe-mist" viewBox="0 0 120 120">
              <defs>
                <filter id="isl-mist-a" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
                  <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
                  <feGaussianBlur stdDeviation="1.6" />
                </filter>
                <filter id="isl-mist-b" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
                  <feTurbulence type="fractalNoise" baseFrequency="0.06 0.03" numOctaves="2" seed="21" result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G" />
                  <feGaussianBlur stdDeviation="2" />
                </filter>
              </defs>
              <g filter="url(#isl-mist-a)">
                <circle cx="60" cy="60" r="38" fill="#10c3d3" fillOpacity=".26" />
                <circle cx="60" cy="60" r="30" fill="#20e7aa" fillOpacity=".16" />
                <circle cx="60" cy="60" r="40" fill="none" stroke="#20e7aa" strokeOpacity=".22" strokeWidth="7" />
              </g>
            </svg>
            <svg className="phibe-mist b" viewBox="0 0 120 120">
              <g filter="url(#isl-mist-b)">
                <circle cx="60" cy="60" r="36" fill="#20e7aa" fillOpacity=".14" />
                <circle cx="60" cy="60" r="42" fill="none" stroke="#10c3d3" strokeOpacity=".24" strokeWidth="6" />
              </g>
            </svg>
          </div>
          <svg ref={faceRef} className="phibe-island-face" viewBox="-18 -18 36 36" aria-hidden="true" style={{ overflow: 'visible' }}>
            <defs>
              <radialGradient id="isl-core" cx=".5" cy=".3" r=".9">
                <stop offset="0" stopColor="#143f4a" />
                <stop offset="1" stopColor="#04101a" />
              </radialGradient>
              <radialGradient id="isl-eye" cx=".4" cy=".35" r=".8">
                <stop offset="0" stopColor="#fff" />
                <stop offset=".5" stopColor="#bff8f3" />
                <stop offset="1" stopColor="#20e7aa" />
              </radialGradient>
              <filter id="isl-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="1.8" />
              </filter>
            </defs>
            <circle r="13" fill="url(#isl-core)" />
            <circle r="13" fill="none" stroke="#20e7aa" strokeOpacity=".5" strokeWidth="1.1" />
            <g ref={eyesRef}>
              <g ref={glowRef} opacity=".5" filter="url(#isl-glow)">
                <ellipse cx="-5.2" cy="0" rx="3" ry="4" fill="#20e7aa" />
                <ellipse cx="5.2" cy="0" rx="3" ry="4" fill="#20e7aa" />
              </g>
              {eye(-5.2)}
              {eye(5.2)}
            </g>
          </svg>
        </div>
        <span className="phibe-island-label" aria-hidden="true" style={{ opacity: wide ? 1 : 0, width: wide ? 'auto' : 0 }}>
          {LABEL[state]}
        </span>
      </div>
    </div>
  );
}
