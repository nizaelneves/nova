import { useEffect, useId, useRef } from 'react';

export type MistState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'error' | 'asleep';

/**
 * Phibe, the mist: a dark round face inside a soft cloud of moving mist (the approved sketch in
 * docs/design/mist/). The mist is an SVG filter whose noise keeps moving; the face has its own,
 * much calmer filter. Everything is driven by a few props, and the animation is paused whenever
 * nobody can see it (asleep, window behind, effects off, reduced motion), so it costs nothing then.
 */
export function PhibeMist({
  size = 200,
  state = 'idle',
  blink = false,
  look = [0, 0],
  still = false,
  getLevel,
}: {
  size?: number;
  state?: MistState;
  /** Eyes shut for a moment. */
  blink?: boolean;
  /** Where the eyes look, -1 to 1 on each axis. */
  look?: [number, number];
  /** Freeze the mist (effects off). */
  still?: boolean;
  /** Voice loudness 0 to 1; makes the eyes pulse while speaking. */
  getLevel?: () => number;
}) {
  const p = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  const svgRef = useRef<SVGSVGElement>(null);
  const glowRef = useRef<SVGEllipseElement[]>([]);

  const asleep = state === 'asleep';
  const eyesShut = asleep || blink;
  const happy = state === 'done';
  // Thinking stirs the mist faster; sleeping and errors keep the same pace.
  const pace = state === 'thinking' ? 0.55 : state === 'listening' ? 0.85 : 1;
  const warm = state === 'error';
  const c1 = warm ? '#ff7a59' : '#10c3d3';
  const c2 = warm ? '#ffb199' : '#20e7aa';
  const eyeTone = warm ? '#ffd2c2' : '#bff8f3';

  // Nothing moves when nobody sees it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const hidden = document.hidden || !document.hasFocus();
      if (still || asleep || reduce.matches || hidden) svg.pauseAnimations();
      else svg.unpauseAnimations();
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('focus', apply);
    window.addEventListener('blur', apply);
    reduce.addEventListener('change', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      window.removeEventListener('focus', apply);
      window.removeEventListener('blur', apply);
      reduce.removeEventListener('change', apply);
    };
  }, [still, asleep]);

  // While speaking the glow of the eyes follows the voice.
  useEffect(() => {
    if (state !== 'speaking' || !getLevel) return;
    const id = window.setInterval(() => {
      const level = Math.min(1, getLevel() * 1.8);
      for (const el of glowRef.current) {
        if (!el) continue;
        el.setAttribute('rx', String(9 + level * 5));
        el.setAttribute('ry', String(12 + level * 6));
        el.setAttribute('fill-opacity', String(0.5 + level * 0.4));
      }
    }, 60);
    return () => window.clearInterval(id);
  }, [state, getLevel]);

  const glowBase = state === 'listening' ? 0.75 : 0.5;
  const sec = (s: number) => `${(s * pace).toFixed(2)}s`;
  const eye = (cx: number, i: number) => {
    if (eyesShut || happy) {
      return (
        <path
          key={cx}
          d={happy ? `M${cx - 7},${98 + 3} Q${cx},${98 - 6} ${cx + 7},${98 + 3}` : `M${cx - 6},98 Q${cx},104 ${cx + 6},98`}
          fill="none"
          stroke={eyeTone}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      );
    }
    return (
      <g key={cx}>
        <ellipse ref={(el) => { if (el) glowRef.current[i] = el; }} cx={cx} cy={98} rx="9" ry="12" fill={c2} fillOpacity={glowBase} filter={`url(#${p}glow)`} />
        <ellipse cx={cx} cy={98} rx="6.4" ry="9.4" fill={`url(#${p}eye)`} />
        <ellipse cx={cx - 1.6} cy={95} rx="1.8" ry="2.6" fill="#fff" fillOpacity=".9" />
      </g>
    );
  };

  const noise = (freq: string, oct: number, seed: number, dur: number, begin: string, dy: number, id: string) => (
    <>
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={oct} seed={seed} result={`${id}t`} />
      <feOffset in={`${id}t`} dx="0" dy="0" result={id}>
        <animate attributeName="dy" dur={sec(dur)} begin={begin} repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values={`0;${-dy};0`} />
      </feOffset>
    </>
  );

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-30 -30 260 260"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={`${p}core`} cx=".5" cy=".3" r=".9"><stop offset="0" stopColor="#143f4a" /><stop offset="1" stopColor="#04101a" /></radialGradient>
        <radialGradient id={`${p}eye`} cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor={eyeTone} /><stop offset="1" stopColor={c2} /></radialGradient>
        <filter id={`${p}glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" /></filter>
        {/* the mist around: big slow billows, soft edges */}
        <filter id={`${p}mist`} x="-40%" y="-35%" width="180%" height="200%" colorInterpolationFilters="sRGB">
          {noise('0.022 0.01', 3, 7, 4.6, '0s', 46, 'a')}
          {noise('0.032 0.014', 2, 21, 3.3, '-1.4s', 32, 'b')}
          <feComposite in="a" in2="b" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="38" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur={sec(3.6)} repeatCount="indefinite" values="30;44;34;42;30" />
          </feDisplacementMap>
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        {/* the face's own contour: the same idea, almost still */}
        <filter id={`${p}soft`} x="-40%" y="-35%" width="180%" height="200%" colorInterpolationFilters="sRGB">
          {noise('0.034 0.012', 3, 7, 2.2, '0s', 46, 'a')}
          {noise('0.05 0.02', 2, 21, 1.5, '-0.6s', 32, 'b')}
          <feComposite in="a" in2="b" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur={sec(1.3)} repeatCount="indefinite" values="1;3.5;1.5;3;1" />
          </feDisplacementMap>
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>
      <g style={{ opacity: asleep ? 0.55 : 1, transition: 'opacity .4s' }}>
        <g filter={`url(#${p}mist)`}>
          <circle cx="100" cy="100" r="78" fill={c1} fillOpacity=".10" />
          <circle cx="100" cy="100" r="64" fill={c1} fillOpacity=".12" />
          <circle cx="100" cy="100" r="55" fill="none" stroke={c2} strokeOpacity=".12" strokeWidth="12" />
        </g>
        <g filter={`url(#${p}soft)`}>
          <circle cx="100" cy="100" r="46" fill={`url(#${p}core)`} />
          <circle cx="100" cy="100" r="46" fill="none" stroke={c2} strokeOpacity=".45" strokeWidth="2.4" />
        </g>
        <g style={{ transform: `translate(${look[0] * 5}px, ${look[1] * 4}px)`, transition: 'transform .16s ease-out' }}>
          {eye(82, 0)}
          {eye(118, 1)}
        </g>
      </g>
    </svg>
  );
}
