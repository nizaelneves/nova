import { useEffect, useRef, type MutableRefObject } from 'react';
import { idleSeconds, installActivity, setIdleSeconds } from '../lib/phibeActivity';
import { useAppStore } from '../lib/store';
import { createIdleLife } from './phibeIdleLife';

/**
 * How busy and how bright she is drawn. The defaults are exactly how she looks today; each knob takes something away or moves it,
 * and she keeps her stars, her nebula and her dark matter.
 */
export interface NebulaTune {
  /** How many of the 90 stars that turn around her are drawn. */
  motes?: number;
  /** Brightness and size of those stars (1 = today). */
  moteAlpha?: number; moteSize?: number;
  /** How often a bright speck is let go from her (1 = today), and how bright it is. */
  dustRate?: number; dustAlpha?: number;
  /** The coloured light inside her, and the light caught on the seams between her lobes (1 = today). */
  energy?: number; seams?: number;
  /** How opaque the dark mass is (up to 1). */
  bodyAlpha?: number;
  /** The share of stars and specks that pass behind the dark mass, which hides them (0 = all in front, as today). */
  behind?: number;
  /** How much the stars and specks in front fade out where the face is (0 = not at all, 1 = fully). */
  faceClear?: number;
  /** How round and firm the dark mass is: its lobes stay closer together and its edge is harder (0 = today, 1 = a clear disc). */
  round?: number;
  /** How strongly the eyes shine: their halo, the lit crescent and the glints (1 = today). */
  eyeGlow?: number;
  /** Size of the eyes (1 = today). */
  eyeK?: number;
  /** Speed of everything that turns (1 = today). */
  spin?: number;
}
export const NEBULA_TUNE: Required<NebulaTune> = { motes: 90, moteAlpha: 1, moteSize: 1, dustRate: 1, dustAlpha: 1, energy: 1, seams: 1, bodyAlpha: 1, behind: 0, faceClear: 0, round: 0, eyeGlow: 1, eyeK: 1, spin: 1 };

/** How she looks in the app: chosen by hand in the refine page. Anything passed in `tune` goes on top of it. */
export const NEBULA_LOOK: Required<NebulaTune> = { ...NEBULA_TUNE, moteAlpha: 0.5, dustRate: 0.5, dustAlpha: 0.42, energy: 0.6, seams: 0.3, behind: 0.5, faceClear: 1, bodyAlpha: 1.15, round: 0.9, eyeGlow: 0.3 };

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

interface Dust { x: number; y: number; vx: number; vy: number; l: number; s: number; b?: boolean }
interface Mote { a: number; r: number; s: number; z: number; c: string; k: number }

/**
 * Phibe as a nebula of dark matter with her own eyes. It lives in the Memoir button (cosmic colours, follows the cursor) and in
 * the island (mint, follows the island's own gaze, feels the voice). `mood` undefined means it reacts to the cursor on its own.
 */
export function PhibeNebula({ mood, burstKey = 0, scale = 0.41, palette = 'cosmic', gaze, getLevel, still = false, id = 'pn', life = false, tune }: {
  mood?: NebulaMood; burstKey?: number; scale?: number; palette?: keyof typeof PALETTES;
  /** Where to look, -1 to 1 on each axis, read every frame. Without it the cursor decides. */
  gaze?: MutableRefObject<[number, number]>;
  /** Loudness of the voice, 0 to 1, read every frame while she speaks. */
  getLevel?: () => number;
  /** Frozen: one frame, no animation. */
  still?: boolean;
  /** Keeps the gradients of several copies on one page apart. */
  id?: string;
  /** She has a life of her own when you are away: looks around, hums, gets sleepy, sleeps and wakes. Off while she is busy with something else. */
  life?: boolean;
  /** How busy and bright she is drawn; leave out for how she looks today. */
  tune?: NebulaTune;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const eyes = useRef<SVGSVGElement>(null);
  const music = useAppStore((s) => s.musicPlaying);
  const live = useRef({ mood, gaze, getLevel, still, burstKey, life, music, tune });
  live.current = { mood, gaze, getLevel, still, burstKey, life, music, tune };
  const lifeRef = useRef(createIdleLife()); // outside the effect: her sleep goes on when the effect restarts (the tab was hidden)
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
    installActivity();
    const dbg = window as unknown as { phibeIdle?: (seconds: number) => void; phibeMusic?: (on?: boolean) => void };
    dbg.phibeIdle = setIdleSeconds; // to try the phases: phibeIdle(70) makes her sleepy, phibeIdle(200) sends her into deep sleep
    dbg.phibeMusic = (on = true) => useAppStore.getState().setMusicPlaying(on);

    const ring: Mote[] = Array.from({ length: 90 }, (_, i) => ({ a: Math.random() * 6.28, r: 30 + Math.random() * 70, s: (0.15 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), z: 0.7 + Math.random() * 1.5, c: cols[i % 3], k: Math.random() }));
    const dust: Dust[] = [];
    const glow = (x: number, y: number, r: number, c: string, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    };

    let mx = 0, my = 0, last = 0, near = false, t = 0, ph = 0, vx = 0, vy = 0, px = CX, py = CY, bounce = 0, blinkT = 3, wT = 0, wx = 0, wy = 0, ex = 0, ey = 0, seen = live.current.burstKey, raf = 0, stopped = false, sighAt = 6, sigh = 0, outAt = -1, lastNow = 0;
    const cur: Mix = { ...STATES.idle };

    const move = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      mx = (e.clientX - b.left) / (b.width / W) - CX; my = (e.clientY - b.top) / (b.height / H) - CY; last = t;
      near = Math.hypot(mx, my) < 900; // in world units: about the width of the window
      outAt = -1;
    };
    // When the cursor leaves the window she keeps looking where it went for a few seconds, instead of losing it.
    const leave = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect(), x = Math.min(Math.max(e.clientX, 0), innerWidth), y = Math.min(Math.max(e.clientY, 0), innerHeight);
      mx = (x - b.left) / (b.width / W) - CX; my = (y - b.top) / (b.height / H) - CY; last = t; near = true; outAt = t;
    };
    if (!gaze) { addEventListener('pointermove', move); document.documentElement.addEventListener('pointerleave', leave); }

    const frame = () => {
      t += 0.016;
      const L = live.current, tn = { ...NEBULA_LOOK, ...L.tune };
      const now = performance.now(), realDt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
      lastNow = now;
      // What she does when you are away (nothing, when she is busy or the effects are off).
      const pose = lifeRef.current.update(realDt, { idle: idleSeconds(), music: L.music, enabled: L.life && !L.still && !reduced, px, py });
      if (L.burstKey !== seen) { // a click, or a change of screen: a hop and a burst of stars
        seen = L.burstKey; bounce = 1;
        for (let i = 0; i < 34; i++) { const a = Math.random() * 6.28, v = 0.8 + Math.random() * 2.6; dust.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, s: 1 + Math.random() * 1.6 }); }
      }
      const idleFor = t - last, holding = outAt >= 0 && t - outAt < 5;
      const key: NebulaMood = L.mood ?? (near && (idleFor < 2.5 || holding) ? 'curious' : !L.life && idleFor > 20 ? 'sleepy' : 'idle');
      const S = STATES[key];
      (Object.keys(cur) as (keyof Mix)[]).forEach((k) => { cur[k] += (S[k] - cur[k]) * 0.07; });
      const lvl = key === 'speaking' && L.getLevel ? Math.min(1, Math.max(0, L.getLevel())) : 0; // the body follows the voice
      ph += 0.016 * cur.spd * (1 + lvl * 0.6) * pose.spin * tn.spin; const T = ph;
      // Every so often, a deep breath: she swells a little and her light rises.
      if (t > sighAt) { sigh = 1; sighAt = t + 7 * (0.8 + Math.random() * 0.5); }
      sigh = Math.max(0, sigh - 0.016 / 1.8);
      const sg = Math.sin(sigh * Math.PI);

      let gx = 0, gy = 0;
      const given = L.gaze?.current;
      const watching = given ? true : near && (idleFor < 2.5 || holding);
      if (given) { gx = given[0] * 90; gy = given[1] * 90; }
      if (S.look === 2) { gx = -70; gy = -90; }
      else if (!given) {
        if (S.look === 1) { gx = mx; gy = my; }
        else { wT -= 0.016; if (wT < 0) { wT = 1.6 + Math.random() * 2.6; wx = (Math.random() - 0.5) * 170; wy = (Math.random() - 0.5) * 90; } gx = watching ? mx : wx; gy = watching ? my : wy; }
      }
      if (pose.takeGaze) { gx = 0; gy = 0; } // alone, she looks where she pleases, not at the cursor
      const gxn = Math.max(-1, Math.min(1, gx / 90)), gyn = Math.max(-1, Math.min(1, gy / 90));
      const eyeEase = pose.ease || 0.34; ex += (gxn * 9 * 1.5 + pose.gx - ex) * eyeEase; ey += (gyn * 6.5 * 1.5 + pose.gy - ey) * eyeEase; // the eyes go first, fast and far; the body follows later and softer
      const lean = given ? 0.18 : S.look === 1 ? 0.06 : 0.04, cl = (v: number) => Math.max(-300, Math.min(300, v));
      const tx = CX + cl(gx) * lean + Math.sin(t * 0.7) * 6 + pose.bx, ty = CY + cl(gy) * lean * 0.8 + Math.sin(t * 1.3) * 7 - bounce * 18 + pose.by;
      vx += (tx - px) * 0.02; vy += (ty - py) * 0.02; vx *= 0.88; vy *= 0.88; px += vx; py += vy; bounce = Math.max(0, bounce - 0.02);
      const sp = Math.hypot(vx, vy), sq = Math.min(0.16, sp * 0.04), breath = (1 + Math.sin(t * 1.7) * 0.07 + bounce * 0.1 + lvl * 0.1 + sg * 0.1) * cur.size * pose.size, ang = Math.atan2(vy, vx), br = cur.bright * (1 + lvl * 0.6) * (1 + sg * 0.35) * pose.bright * pose.mist;

      const brE = br * tn.energy, brS = br * tn.seams;
      g.clearRect(0, 0, W, H);
      const M = (fn: () => void) => { g.save(); g.translate(px, py); g.rotate(ang); g.scale((1 + sq) * breath * pose.sx, (1 - sq * 0.6) * breath * pose.sy); g.rotate(-ang); fn(); g.restore(); };
      // energy: the colour that burns inside the dark
      g.globalCompositeOperation = 'lighter';
      M(() => {
        glow(0, 0, 130, halo, 0.3 * brE);
        for (let i = 0; i < 10; i++) { const a = T * 0.35 + i * 0.628, r = 34 + Math.sin(t * 0.7 + i * 1.7) * 16; glow(Math.cos(a) * r * 1.2, Math.sin(a * 1.15) * r * 0.85, 50 + Math.sin(t + i) * 8, cols[i % 3], 0.27 * brE); }
      });
      // Where the stars are, and the specks: they move once a frame. A share of them is drawn before the dark mass, which hides them; that is what gives her a clear shape.
      for (const p of ring) {
        if (key === 'listening') { p.r -= 0.5; if (p.r < 18) p.r = 100; } // while she listens, matter is drawn in toward her eyes
        p.a += p.s * 0.008 * cur.spd * (1 + sp * 0.15) * pose.spin * tn.spin; p.r += Math.sin(t * 0.5 + p.a * 3) * 0.08;
      }
      if (Math.random() < 0.5 * tn.dustRate) { const a = Math.random() * 6.28, rr = 40 + Math.random() * 40; dust.push({ x: px + Math.cos(a) * rr * 1.1, y: py + Math.sin(a) * rr * 0.85, vx: Math.cos(a) * 0.3 + vx * 0.2, vy: Math.sin(a) * 0.3 - 0.15, l: 1, s: 0.8 + Math.random() * 1.3, b: Math.random() < tn.behind }); }
      for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.x += d.vx; d.y += d.vy; d.l -= 0.013; if (d.l <= 0) dust.splice(i, 1); }
      const nm = Math.min(ring.length, Math.round(tn.motes));
      const clear = (x: number, y: number) => 1 - tn.faceClear * Math.max(0, 1 - Math.hypot((x - px) / 72, (y - py) / 60)); // fades what is in front of the face
      const drawMotes = (behind: boolean) => {
        for (let i = 0; i < nm; i++) {
          const p = ring[i];
          if ((p.k < tn.behind) !== behind) continue;
          const x = px + Math.cos(p.a) * p.r * 1.25 * cur.size, y = py + Math.sin(p.a) * p.r * 0.85 * cur.size, f = (behind ? 1 : clear(x, y)) * tn.moteAlpha * pose.mist;
          glow(x, y, p.z * 4 * tn.moteSize, p.c, 0.42 * f); g.fillStyle = `rgba(255,255,255,${(0.75 * f).toFixed(3)})`; g.beginPath(); g.arc(x, y, p.z * 0.7 * tn.moteSize, 0, 6.283); g.fill();
        }
        for (let i = 0; i < dust.length; i++) {
          const d = dust[i];
          if (!!d.b !== behind) continue;
          const f = (behind ? 1 : clear(d.x, d.y)) * tn.dustAlpha;
          glow(d.x, d.y, d.s * 4, cols[i % 3], d.l * 0.5 * f); g.fillStyle = `rgba(255,255,255,${(d.l * f).toFixed(3)})`; g.beginPath(); g.arc(d.x, d.y, d.s * 0.7, 0, 6.283); g.fill();
        }
      };
      drawMotes(true);
      // dark matter: lobes that drift and merge, never the same shape twice
      g.globalCompositeOperation = 'source-over';
      const lobes: [number, number, number, number][] = [];
      M(() => {
        for (let i = 0; i < 9; i++) {
          const a = T * (0.2 + i * 0.045) * (i % 2 ? 1 : -1) + i * 0.7, r = i ? (26 + Math.sin(t * 0.6 + i * 2.1) * 14) * (1 - 0.7 * tn.round) : 0, rad = i ? 40 + Math.sin(t * 0.9 + i) * 9 * (1 - 0.7 * tn.round) + 6 * tn.round : 56 + 6 * tn.round;
          const x = Math.cos(a) * r * 1.25, y = Math.sin(a * 1.1) * r * 0.9; lobes.push([x, y, rad, a]);
          const d = g.createRadialGradient(x, y, 2, x, y, rad); d.addColorStop(0, `rgba(${dark},${(Math.min(1, 0.96 * tn.bodyAlpha) * pose.mist).toFixed(3)})`); d.addColorStop(0.6 + 0.3 * tn.round, `rgba(${dark},${(Math.min(1, 0.8 * tn.bodyAlpha) * pose.mist).toFixed(3)})`); d.addColorStop(1, `rgba(${dark},0)`);
          g.fillStyle = d; g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.fill();
        }
      });
      // light caught on the edges and in the seams between lobes
      g.globalCompositeOperation = 'lighter';
      M(() => lobes.forEach(([x, y, rad, a], i) => {
        if (!i) return;
        glow(x + Math.cos(a + 1.2) * rad * 0.8, y + Math.sin(a + 1.2) * rad * 0.7, 26, cols[i % 3], (0.3 + Math.sin(t * 1.4 + i) * 0.09) * brS);
        const n = lobes[(i % 8) + 1]; glow((x + n[0]) / 2, (y + n[1]) / 2, 18, cols[(i + 1) % 3], 0.16 * brS);
      }));
      drawMotes(false);
      g.globalCompositeOperation = 'source-over';
      lifeRef.current.draw(g); // notes, bubbles, the star, dust, Zzzz, sparks

      // the eyes
      face.setAttribute('transform', `translate(${(px + ex).toFixed(1)},${(py + ey - 2).toFixed(1)}) rotate(${((cur.tilt + 14) * gxn * 0.9 + pose.tilt).toFixed(1)}) scale(${(breath * tn.eyeK).toFixed(3)})`);
      if (pose.blink && blinkT > 0.13) blinkT = 0.12;
      blinkT -= 0.016; if (blinkT < 0) blinkT = 2.4 + Math.random() * 3.2;
      const bl = blinkT < 0.13 ? 0.06 : 1, pulse = 1 + (S.look === 2 ? Math.sin(t * 5) * 0.18 : 0);
      // Eyes: open ovals; lids that close into a sleeping curve; a lit neon crescent (happy, humming); little glints (dancing).
      const happy = cur.arc > 0 ? cur.arc : 0, sleepy = cur.arc < 0 ? -cur.arc : 0;
      const cres = Math.max(pose.crescent, happy), closedA = Math.max(Math.min(1, Math.max(0, (pose.lid - 0.72) / 0.28)), sleepy), openA = (1 - closedA) * (1 - cres), openY = Math.max(0.05, 1 - pose.lid);
      for (const [n, x] of [['.eL', -21], ['.eR', 21]] as const) {
        const e = q(n), body = `scale(${cur.sx.toFixed(3)},${(cur.sy * bl * (1 + lvl * 0.12) * openY).toFixed(3)})`;
        e.setAttribute('transform', `translate(${x},0)`);
        const open = e.querySelector('.open')!; open.setAttribute('opacity', openA.toFixed(2)); open.setAttribute('transform', body);
        const halo = e.querySelector('.h')!; halo.setAttribute('opacity', (Math.min(1, cur.glow * pulse + (S.look === 1 ? 0.05 : 0)) * tn.eyeGlow * (1 - cres) * (1 - 0.5 * closedA)).toFixed(2)); halo.setAttribute('transform', body);
        const arc = e.querySelector('.arc')!; arc.setAttribute('opacity', closedA.toFixed(2)); arc.setAttribute('transform', 'scale(1,-1) translate(0,-1)');
        e.querySelector('.cres')!.setAttribute('opacity', (cres * (0.35 + 0.65 * Math.min(1, tn.eyeGlow))).toFixed(2));
        e.querySelector('.gl')!.setAttribute('opacity', (pose.sparkle * tn.eyeGlow * (0.75 + 0.25 * Math.sin(t * 9)) * openA).toFixed(2));
      }
      if (!stopped && !L.still && !reduced) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { stopped = true; cancelAnimationFrame(raf); removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, scale, palette, !!gaze]);

  const eye = (n: string) => (
    <g className={n}>
      <ellipse className="h" rx="11" ry="15" fill={P.c2} filter={`url(#${id}-bl)`} />
      <g className="open"><ellipse rx={EW} ry={EH} fill={`url(#${id}-eg)`} /><ellipse cx="-1.8" cy="-3.2" rx="2" ry="2.8" fill="#fff" opacity=".9" /></g>
      <path className="arc" d="M-7 3 Q0 -6 7 3" fill="none" stroke={P.tone} strokeWidth="3.6" strokeLinecap="round" opacity="0" />
      <g className="cres" opacity="0">
        <ellipse cy="-1" rx="13" ry="11" fill={P.c2} opacity=".42" filter={`url(#${id}-bl)`} />
        <path d="M-8.5 3.4 Q0 -9.5 8.5 3.4" fill="none" stroke={P.c2} strokeWidth="5" strokeLinecap="round" opacity=".55" filter={`url(#${id}-bl)`} />
        <path d="M-8.5 3.4 Q0 -9.5 8.5 3.4" fill="none" stroke={`url(#${id}-cg)`} strokeWidth="3.8" strokeLinecap="round" />
        <path d="M-7.5 2.4 Q0 -7.4 7.5 2.4" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity=".95" />
        <circle cx="-8.8" cy="3.6" r="1.2" fill="#fff" /><circle cx="8.8" cy="3.6" r="1.2" fill="#fff" />
      </g>
      <g className="gl" opacity="0" fill="#fff">
        <path d="M-2.6 -8.6 L-1.9 -5.1 L1.6 -4.4 L-1.9 -3.7 L-2.6 -0.2 L-3.3 -3.7 L-6.8 -4.4 L-3.3 -5.1 Z" />
        <path d="M2.6 2 L3 4.1 L5.1 4.5 L3 4.9 L2.6 7 L2.2 4.9 L0.1 4.5 L2.2 4.1 Z" />
      </g>
    </g>
  );
  const size = nebulaSize(scale);
  return (
    <div className="neb-orb" aria-hidden="true" style={{ position: 'relative', width: size.width, height: size.height, pointerEvents: 'none' }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: size.width, height: size.height }} />
      <svg ref={eyes} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: size.width, height: size.height, overflow: 'visible' }}>
        <defs>
          <filter id={`${id}-bl`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
          <linearGradient id={`${id}-cg`} x1="-9" y1="0" x2="9" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={P.c2} /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor={P.c2} /></linearGradient>
          <radialGradient id={`${id}-eg`} cx="38%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor={P.tone} /><stop offset="1" stopColor={P.c2} /></radialGradient>
        </defs>
        <g className="face">{eye('eL')}{eye('eR')}</g>
      </svg>
    </div>
  );
}
