import { useEffect, useRef, type MutableRefObject } from 'react';

export type NebulaMood = 'idle' | 'curious' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'sleepy';

// Phibe's eyes have no brows and no mouth: a tall glowing oval, white at the heart, with a halo. Mood lives in the eyes
// (shape, size, light) and in the nebula (how fast it turns, how tight it holds, how bright its energy burns).
const STATES: Record<NebulaMood, { sx: number; sy: number; glow: number; arc: number; look: number; tilt: number; spd: number; size: number; bright: number }> = {
  idle:      { sx: 1,    sy: 1,    glow: 0.55, arc: 0,  look: 0, tilt: 0,  spd: 1,   size: 1,    bright: 1 },
  curious:   { sx: 1.1,  sy: 1.3,  glow: 1,    arc: 0,  look: 1, tilt: 7,  spd: 1.5, size: 0.92, bright: 1.35 },
  listening: { sx: 1.15, sy: 1.38, glow: 1,    arc: 0,  look: 1, tilt: 0,  spd: 1.3, size: 0.9,  bright: 1.5 },
  thinking:  { sx: 0.88, sy: 1.1,  glow: 0.75, arc: 0,  look: 2, tilt: -8, spd: 3.2, size: 0.96, bright: 1.15 },
  speaking:  { sx: 1.05, sy: 1.15, glow: 0.95, arc: 0,  look: 1, tilt: 0,  spd: 1.8, size: 1,    bright: 1.3 },
  happy:     { sx: 1,    sy: 1,    glow: 0.9,  arc: 1,  look: 0, tilt: -3, spd: 2.2, size: 1.14, bright: 1.6 },
  sleepy:    { sx: 1,    sy: 1,    glow: 0.3,  arc: -1, look: 0, tilt: 5,  spd: 0.35, size: 0.84, bright: 0.55 },
};
type Mix = Record<keyof (typeof STATES)['idle'], number>;

const PALETTES = {
  cosmic: { cols: ['143,227,255', '167,139,250', '232,121,249'], halo: '124,92,255', c2: '#7c5cff', tone: '#d9f6ff', dark: '2,1,10' },
  mint:   { cols: ['32,231,170', '143,244,230', '80,190,255'],   halo: '32,231,170',  c2: '#20e7aa', tone: '#bff8f3', dark: '2,8,8' },
} as const;

const W = 360, H = 280, CX = W / 2, CY = H / 2;
const EW = 6.8, EH = 10;
/** The pixel size of the nebula's box at a given scale. */
export const nebulaSize = (scale: number) => ({ width: W * scale, height: H * scale });

interface Dust { x: number; y: number; vx: number; vy: number; l: number; s: number }
interface Mote { a: number; r: number; s: number; z: number; c: string }

/**
 * Phibe as a nebula of dark matter with her own eyes. It lives in the Memoir button (cosmic colours, follows the cursor) and in
 * the island (mint, follows the island's own gaze, feels the voice). `mood` undefined means it reacts to the cursor on its own.
 */
export function PhibeNebula({ mood, burstKey = 0, scale = 0.46, palette = 'cosmic', gaze, getLevel, still = false, id = 'pn' }: {
  mood?: NebulaMood; burstKey?: number; scale?: number; palette?: keyof typeof PALETTES;
  /** Where to look, -1 to 1 on each axis, read every frame. Without it the cursor decides. */
  gaze?: MutableRefObject<[number, number]>;
  /** Loudness of the voice, 0 to 1, read every frame while she speaks. */
  getLevel?: () => number;
  /** Frozen: one frame, no animation. */
  still?: boolean;
  /** Keeps the gradients of several copies on one page apart. */
  id?: string;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const eyes = useRef<SVGSVGElement>(null);
  const live = useRef({ mood, gaze, getLevel, still, burstKey });
  live.current = { mood, gaze, getLevel, still, burstKey };
  const P = PALETTES[palette];

  useEffect(() => {
    const canvas = cv.current, svg = eyes.current;
    if (!canvas || !svg) return;
    const g = canvas.getContext('2d')!, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
    g.scale(dpr * scale, dpr * scale); // draw in the 360 x 280 world; the canvas itself is only as big as it is shown
    const q = (s: string) => svg.querySelector(s) as SVGElement;
    const face = q('.face'), reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { cols, halo, dark } = P;

    const ring: Mote[] = Array.from({ length: 90 }, (_, i) => ({ a: Math.random() * 6.28, r: 30 + Math.random() * 70, s: (0.15 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), z: 0.7 + Math.random() * 1.5, c: cols[i % 3] }));
    const dust: Dust[] = [];
    const glow = (x: number, y: number, r: number, c: string, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    };

    let mx = 0, my = 0, last = 0, near = false, t = 0, ph = 0, vx = 0, vy = 0, px = CX, py = CY, bounce = 0, blinkT = 3, wT = 0, wx = 0, wy = 0, ex = 0, ey = 0, seen = live.current.burstKey, raf = 0, stopped = false;
    const cur: Mix = { ...STATES.idle };

    const move = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      mx = (e.clientX - b.left) / (b.width / W) - CX; my = (e.clientY - b.top) / (b.height / H) - CY; last = t;
      near = Math.hypot(mx, my) < 900; // in world units: about the width of the window
    };
    if (!gaze) addEventListener('pointermove', move);

    const frame = () => {
      t += 0.016;
      const L = live.current;
      if (L.burstKey !== seen) { // a click, or a change of screen: a hop and a burst of stars
        seen = L.burstKey; bounce = 1;
        for (let i = 0; i < 34; i++) { const a = Math.random() * 6.28, v = 0.8 + Math.random() * 2.6; dust.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, s: 1 + Math.random() * 1.6 }); }
      }
      const idleFor = t - last;
      const key: NebulaMood = L.mood ?? (near && idleFor < 2.5 ? 'curious' : idleFor > 20 ? 'sleepy' : 'idle');
      const S = STATES[key];
      (Object.keys(cur) as (keyof Mix)[]).forEach((k) => { cur[k] += (S[k] - cur[k]) * 0.07; });
      const lvl = key === 'speaking' && L.getLevel ? Math.min(1, Math.max(0, L.getLevel())) : 0; // the body follows the voice
      ph += 0.016 * cur.spd * (1 + lvl * 0.6); const T = ph;

      let gx = 0, gy = 0;
      const given = L.gaze?.current;
      const watching = given ? true : near && idleFor < 2.5;
      if (given) { gx = given[0] * 90; gy = given[1] * 90; }
      if (S.look === 2) { gx = -70; gy = -90; }
      else if (!given) {
        if (S.look === 1) { gx = mx; gy = my; }
        else { wT -= 0.016; if (wT < 0) { wT = 1.6 + Math.random() * 2.6; wx = (Math.random() - 0.5) * 170; wy = (Math.random() - 0.5) * 90; } gx = watching ? mx : wx; gy = watching ? my : wy; }
      }
      const gxn = Math.max(-1, Math.min(1, gx / 90)), gyn = Math.max(-1, Math.min(1, gy / 90));
      ex += (gxn * 9 - ex) * 0.22; ey += (gyn * 6.5 - ey) * 0.22; // the eyes go first and fast; the body follows slower
      const lean = given ? 0.2 : S.look === 1 ? 0.06 : 0.04, cl = (v: number) => Math.max(-300, Math.min(300, v));
      const tx = CX + cl(gx) * lean + Math.sin(t * 0.7) * 6, ty = CY + cl(gy) * lean * 0.8 + Math.sin(t * 1.3) * 7 - bounce * 18;
      vx += (tx - px) * 0.028; vy += (ty - py) * 0.028; vx *= 0.86; vy *= 0.86; px += vx; py += vy; bounce = Math.max(0, bounce - 0.02);
      const sp = Math.hypot(vx, vy), sq = Math.min(0.16, sp * 0.04), breath = (1 + Math.sin(t * 1.7) * 0.05 + bounce * 0.1 + lvl * 0.1) * cur.size, ang = Math.atan2(vy, vx), br = cur.bright * (1 + lvl * 0.6);

      g.clearRect(0, 0, W, H);
      const M = (fn: () => void) => { g.save(); g.translate(px, py); g.rotate(ang); g.scale((1 + sq) * breath, (1 - sq * 0.6) * breath); g.rotate(-ang); fn(); g.restore(); };
      // energy: the colour that burns inside the dark
      g.globalCompositeOperation = 'lighter';
      M(() => {
        glow(0, 0, 130, halo, 0.3 * br);
        for (let i = 0; i < 10; i++) { const a = T * 0.35 + i * 0.628, r = 34 + Math.sin(t * 0.7 + i * 1.7) * 16; glow(Math.cos(a) * r * 1.2, Math.sin(a * 1.15) * r * 0.85, 50 + Math.sin(t + i) * 8, cols[i % 3], 0.27 * br); }
      });
      // dark matter: lobes that drift and merge, never the same shape twice
      g.globalCompositeOperation = 'source-over';
      const lobes: [number, number, number, number][] = [];
      M(() => {
        for (let i = 0; i < 9; i++) {
          const a = T * (0.2 + i * 0.045) * (i % 2 ? 1 : -1) + i * 0.7, r = i ? 26 + Math.sin(t * 0.6 + i * 2.1) * 14 : 0, rad = i ? 40 + Math.sin(t * 0.9 + i) * 9 : 56;
          const x = Math.cos(a) * r * 1.25, y = Math.sin(a * 1.1) * r * 0.9; lobes.push([x, y, rad, a]);
          const d = g.createRadialGradient(x, y, 2, x, y, rad); d.addColorStop(0, `rgba(${dark},.96)`); d.addColorStop(0.6, `rgba(${dark},.8)`); d.addColorStop(1, `rgba(${dark},0)`);
          g.fillStyle = d; g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.fill();
        }
      });
      // light caught on the edges and in the seams between lobes
      g.globalCompositeOperation = 'lighter';
      M(() => lobes.forEach(([x, y, rad, a], i) => {
        if (!i) return;
        glow(x + Math.cos(a + 1.2) * rad * 0.8, y + Math.sin(a + 1.2) * rad * 0.7, 26, cols[i % 3], (0.3 + Math.sin(t * 1.4 + i) * 0.09) * br);
        const n = lobes[(i % 8) + 1]; glow((x + n[0]) / 2, (y + n[1]) / 2, 18, cols[(i + 1) % 3], 0.16 * br);
      }));
      for (const p of ring) {
        if (key === 'listening') { p.r -= 0.5; if (p.r < 18) p.r = 100; } // while she listens, matter is drawn in toward her eyes
        p.a += p.s * 0.008 * cur.spd * (1 + sp * 0.15); p.r += Math.sin(t * 0.5 + p.a * 3) * 0.08;
        const x = px + Math.cos(p.a) * p.r * 1.25 * cur.size, y = py + Math.sin(p.a) * p.r * 0.85 * cur.size;
        glow(x, y, p.z * 4, p.c, 0.42); g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(x, y, p.z * 0.7, 0, 6.283); g.fill();
      }
      if (Math.random() < 0.5) { const a = Math.random() * 6.28, rr = 40 + Math.random() * 40; dust.push({ x: px + Math.cos(a) * rr * 1.1, y: py + Math.sin(a) * rr * 0.85, vx: Math.cos(a) * 0.3 + vx * 0.2, vy: Math.sin(a) * 0.3 - 0.15, l: 1, s: 0.8 + Math.random() * 1.3 }); }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i]; d.x += d.vx; d.y += d.vy; d.l -= 0.013;
        if (d.l <= 0) { dust.splice(i, 1); continue; }
        glow(d.x, d.y, d.s * 4, cols[i % 3], d.l * 0.5); g.fillStyle = `rgba(255,255,255,${d.l})`; g.beginPath(); g.arc(d.x, d.y, d.s * 0.7, 0, 6.283); g.fill();
      }
      g.globalCompositeOperation = 'source-over';

      // the eyes
      face.setAttribute('transform', `translate(${(px + ex).toFixed(1)},${(py + ey - 2).toFixed(1)}) rotate(${(cur.tilt * gxn * 0.9).toFixed(1)}) scale(${breath.toFixed(3)})`);
      blinkT -= 0.016; if (blinkT < 0) blinkT = 2.4 + Math.random() * 3.2;
      const bl = blinkT < 0.13 ? 0.06 : 1, pulse = 1 + (S.look === 2 ? Math.sin(t * 5) * 0.18 : 0), a = Math.abs(cur.arc);
      for (const [n, x] of [['.eL', -21], ['.eR', 21]] as const) {
        const e = q(n);
        e.setAttribute('transform', `translate(${x},0) scale(${cur.sx.toFixed(3)},${(cur.sy * bl * (1 + lvl * 0.12)).toFixed(3)})`);
        e.querySelector('.open')!.setAttribute('opacity', (1 - a).toFixed(2));
        const arc = e.querySelector('.arc')!; arc.setAttribute('opacity', a.toFixed(2)); arc.setAttribute('transform', `scale(1,${cur.arc >= 0 ? 1 : -1}) translate(0,${cur.arc >= 0 ? 0 : -1})`);
        e.querySelector('.h')!.setAttribute('opacity', Math.min(1, cur.glow * pulse + (S.look === 1 ? 0.05 : 0)).toFixed(2));
      }
      if (!stopped && !L.still && !reduced) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { stopped = true; cancelAnimationFrame(raf); removeEventListener('pointermove', move); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, scale, palette, !!gaze]);

  const eye = (n: string) => (
    <g className={n}>
      <ellipse className="h" rx="11" ry="15" fill={P.c2} filter={`url(#${id}-bl)`} />
      <g className="open"><ellipse rx={EW} ry={EH} fill={`url(#${id}-eg)`} /><ellipse cx="-1.8" cy="-3.2" rx="2" ry="2.8" fill="#fff" opacity=".9" /></g>
      <path className="arc" d="M-7 3 Q0 -6 7 3" fill="none" stroke={P.tone} strokeWidth="3.6" strokeLinecap="round" />
    </g>
  );
  const size = nebulaSize(scale);
  return (
    <div className="neb-orb" aria-hidden="true" style={{ position: 'relative', width: size.width, height: size.height, pointerEvents: 'none' }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: size.width, height: size.height }} />
      <svg ref={eyes} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: size.width, height: size.height, overflow: 'visible' }}>
        <defs>
          <filter id={`${id}-bl`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
          <radialGradient id={`${id}-eg`} cx="38%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor={P.tone} /><stop offset="1" stopColor={P.c2} /></radialGradient>
        </defs>
        <g className="face">{eye('eL')}{eye('eR')}</g>
      </svg>
    </div>
  );
}
