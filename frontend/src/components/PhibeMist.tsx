import { useEffect, useRef, type MutableRefObject } from 'react';
import { disintegrate, drawParticles, makeRng, reintegrate, stepAll, type Particle } from '../lib/fx/particles';
import { barHeights, bodyVisibility, paceOf } from '../lib/orbMotion';

export type MistState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'error' | 'asleep';

/** Drawing units: the face has a radius of 62, the mist reaches about 110. One unit is `size / 350.4` px. */
const UNITS_PER_SIZE = 350.4;
const TAU = Math.PI * 2;

/** The Done hop at `sec` seconds after it began: lift in px (for a 230px Orb) and the stretch across and along. Rests after 3.2 s. */
const HOP: [number, number, number, number][] = [
  [0, 0, 1, 1], [0.24, 0, 1, 1], [0.48, 0, 1.07, 0.92], [0.96, -26, 0.96, 1.06], [1.44, 0, 1.07, 0.92], [1.76, 0, 1, 1],
  [2.08, 0, 1.05, 0.94], [2.48, -14, 0.98, 1.03], [2.88, 0, 1.04, 0.96], [3.2, 0, 1, 1],
];
function hopAt(sec: number): { y: number; x: number; s: number } | null {
  if (sec >= 3.2) return null;
  let i = 1;
  while (HOP[i][0] < sec) i++;
  const [t0, y0, x0, s0] = HOP[i - 1];
  const [t1, y1, x1, s1] = HOP[i];
  const k = (sec - t0) / (t1 - t0);
  const e = k * k * (3 - 2 * k); // ease in and out between poses
  return { y: y0 + (y1 - y0) * e, x: x0 + (x1 - x0) * e, s: s0 + (s1 - s0) * e };
}

/** The four bands the Orb tears into on Error: top and bottom as a share of its height, and how far (px at 230) each slides. */
const BANDS: [number, number, number][] = [[0.22, 0.34, 11], [0.4, 0.52, -15], [0.58, 0.7, 9], [0.74, 0.86, -12]];

interface Blob { a: number; d: number; r: number; k: number; mint: boolean }
interface Look { glow: string; fill: string; tone: string; mist: [string, string] }

const hexRgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hex: string, alpha: number) {
  const [R, G, B] = hexRgb(hex);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
  g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

const BLOBS: Blob[] = Array.from({ length: 22 }, (_, i) => {
  // Fixed, even-looking numbers (no Math.random): the same cloud every time.
  const u = (n: number) => (Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
  const f = (n: number) => Math.abs(u(n));
  return { a: (i / 22) * TAU + f(1) * 0.25, d: 50 + f(2) * 30, r: 34 + f(3) * 20, k: f(4), mint: i % 2 === 1 };
});

/**
 * Phibe, the Orb: a dark round face with no outline, a cloud of cyan and mint mist around it, and the
 * same eyes as always. When Phibe speaks, slim bars of a voice meter rise around the face and the eyes
 * glow with the voice. When it sleeps the body breaks into pixels and small Fibonacci numbers that drift
 * away (like the menu bar), and gathers again on waking.
 *
 * Two canvases: the mist (blurred by CSS) and the crisp layer on top. The loop only runs while somebody can
 * see something move (not asleep and settled, not `still`, not reduced motion, not a hidden window).
 */
export function PhibeMist({
  size = 200,
  state = 'idle',
  blink = false,
  look = [0, 0],
  lookRef,
  gazeScale = 1,
  dissolve = false,
  still = false,
  getLevel,
  hideEyes = false,
}: {
  size?: number;
  state?: MistState;
  /** Eyes shut for a moment. */
  blink?: boolean;
  /** Where the eyes look, -1 to 1 on each axis. */
  look?: [number, number];
  /** The same, read on every frame: for a gaze that moves a lot (no re-render per mouse move). Wins over `look`. */
  lookRef?: MutableRefObject<[number, number]>;
  /** How far the eyes travel; 1 is the usual, bigger for a small Orb that must show where it looks. */
  gazeScale?: number;
  /** The body breaks into pixels and numbers and gathers again when this goes back to false; the eyes stay open. */
  dissolve?: boolean;
  /** Freeze the mist (effects off). */
  still?: boolean;
  /** Voice loudness 0 to 1; drives the bars and the eyes while speaking. */
  getLevel?: () => number;
  /** Do not draw the eyes (for pages that draw their own). */
  hideEyes?: boolean;
}) {
  const mistRef = useRef<HTMLCanvasElement>(null);
  const faceRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, blink, look, lookRef, gazeScale, getLevel, still, dissolve, hideEyes });
  live.current = { state, blink, look, lookRef, gazeScale, getLevel, still, dissolve, hideEyes };
  const anim = useRef({ gone: state === 'asleep' ? 1 : 0, speak: 0, level: 0.5, gx: 0, gy: 0, dust: [] as Particle[], was: state === 'asleep', last: 0, listen: 0, think: 0, prev: state as MistState, doneAt: -1, idle: false, lid: 0, bx: 0, by: 0 });
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const mist = mistRef.current;
    const face = faceRef.current;
    const mctx = mist?.getContext('2d');
    const fctx = face?.getContext('2d');
    if (!mist || !face || !mctx || !fctx) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    mist.width = face.width = px;
    mist.height = face.height = px;
    const unit = px / UNITS_PER_SIZE;
    const a = anim.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;

    const draw = (now: number) => {
      const { state: st, blink: shut, look: lookProp, lookRef: lookLive, gazeScale: travel, getLevel: level, dissolve: broken } = live.current;
      if (a.idle && live.current.state === 'asleep' && now - a.last < 33) return false; // only the bubble moves: about 30 frames a second is plenty
      const gaze = lookLive?.current ?? lookProp;
      const sleeping = st === 'asleep' || broken;
      const warm = st === 'error';
      const c1 = warm ? '#ff7a59' : '#10c3d3';
      const c2 = warm ? '#ffb199' : '#20e7aa';
      const tone = warm ? '#ffd2c2' : '#bff8f3';
      const t = now / 1000 / paceOf(st);
      const dt = a.last ? Math.min(0.05, (now - a.last) / 1000) : 0.016;
      a.last = now;

      // Falling asleep breaks the body into dust; waking gathers it back.
      if (sleeping !== a.was) {
        a.was = sleeping;
        const rand = makeRng(Math.floor(now) & 0xffffff);
        const spawn = (i: number) => {
          for (let tries = 0; tries < 20; tries++) {
            const x = (rand() * 2 - 1) * 112;
            const y = (rand() * 2 - 1) * 112;
            if (Math.hypot(x, y) > 112) continue;
            const glyph = i < 380 ? 'px' : 'num';
            if (sleeping) {
              const p = disintegrate(rand, x, y, undefined, glyph, rand() * 0.55);
              p.vx *= 1.5; p.vy *= 1.5; p.life *= 1.3; p.size = glyph === 'px' ? 3 : 10 + Math.floor(rand() * 4);
              a.dust.push(p);
            } else {
              const p = reintegrate(rand, x, y, 110, 0.05 + rand() * 0.4, undefined, glyph);
              p.size = glyph === 'px' ? 3 : 10 + Math.floor(rand() * 4);
              a.dust.push(p);
            }
            return;
          }
        };
        for (let i = 0; i < 450; i++) spawn(i);
      }
      a.gone += ((sleeping ? 1 : 0) - a.gone) * (1 - Math.exp(-dt * 2.7));
      const vis = bodyVisibility(a.gone);
      a.speak += ((st === 'speaking' ? 1 : 0) - a.speak) * (1 - Math.exp(-dt * 7));
      const raw = st === 'speaking' ? (level ? Math.min(1, level() * 1.8) : 0.45 + 0.55 * Math.abs(Math.sin(t * 2.3)) * Math.abs(Math.sin(t * 0.7 + 1))) : 0;
      a.level += (raw - a.level) * (1 - Math.exp(-dt * 14));
      a.think += ((st === 'thinking' && !live.current.still && !reduce.matches ? 1 : 0) - a.think) * (1 - Math.exp(-dt * 6));
      a.listen += ((st === 'listening' && !live.current.still && !reduce.matches ? 1 : 0) - a.listen) * (1 - Math.exp(-dt * 6));
      a.gx += (gaze[0] * 6.75 * travel - a.gx) * (1 - Math.exp(-dt * 12));
      a.gy += (gaze[1] * 5.4 * travel - a.gy) * (1 - Math.exp(-dt * 12));
      // Looking: the eyes go first and fast; the body follows a moment later and more slowly, like a person turning to look.
      const lead = live.current.still || reduce.matches || sleeping ? 0 : 1;
      a.bx += (gaze[0] * 9.1 * lead - a.bx) * (1 - Math.exp(-dt * 3.2));
      a.by += (gaze[1] * 7.6 * lead - a.by) * (1 - Math.exp(-dt * 3.2));

      // The mist.
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, px, px);
      if (vis > 0.01) {
      mctx.setTransform(unit, 0, 0, unit, px / 2, px / 2);
      mctx.globalCompositeOperation = 'lighter';
      for (const b of BLOBS) {
        // The billows breathe on the old cloud's 3 to 5 second beat and wander, so the contour keeps changing.
        const ang = b.a + t * 0.09 * (b.k > 0.5 ? 1 : -1);
        const d = b.d + Math.sin(t * (TAU / (b.k > 0.5 ? 4.6 : 3.3)) + b.k * 9) * 13;
        const x = Math.cos(ang) * d + Math.cos(t * (TAU / 3.9) + b.k * 11) * 7;
        const y = Math.sin(ang) * d + Math.sin(t * (TAU / 3.3) + b.k * 5) * 7;
        blob(mctx, x, y, b.r * (1 + 0.22 * Math.sin(t * (TAU / 4.2) + b.k * 7)), b.mint ? c2 : c1, 0.2);
      }
      // A faint steady ring so the cloud never opens a gap while the billows move.
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TAU;
        const d = 62 + Math.sin(t * 0.9 + i) * 4;
        blob(mctx, Math.cos(ang) * d, Math.sin(ang) * d, 44 + Math.sin(t * 1.3 + i * 2) * 5, i % 2 ? c2 : c1, 0.07);
      }
      mctx.globalCompositeOperation = 'source-over';
      mctx.strokeStyle = c2;
      mctx.globalAlpha = 0.14;
      mctx.lineWidth = 14;
      mctx.beginPath();
      mctx.arc(0, 0, 62 + Math.sin(t) * 2, 0, TAU);
      mctx.stroke();
      mctx.globalCompositeOperation = 'lighter';
      blob(mctx, 0, 0, 108, c1, 0.08);
      mctx.globalCompositeOperation = 'source-over';
      [[c1, 0, 90], [c2, 2.4, 98]].forEach(([hex, ph, r]) => {
        mctx.strokeStyle = hex as string;
        mctx.globalAlpha = 0.2;
        mctx.lineWidth = 6;
        mctx.beginPath();
        for (let i = 0; i <= 140; i++) {
          const th = (i / 140) * TAU;
          const rr = (r as number) + Math.sin(th * 3 + t * 0.9 + (ph as number)) * 10 + Math.sin(th * 5 - t * 0.6 + (ph as number)) * 4;
          if (i) mctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr); else mctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
        }
        mctx.closePath();
        mctx.stroke();
      });
      mctx.globalAlpha = 1;
      }
      mist.style.opacity = String(vis * (1 - 0.15 * a.speak));
      // Speaking: the whole Orb swells and glows a little with each syllable.
      const swell = a.speak * a.level;
      // Done: a happy hop (squash, jump, land, one more small hop), played once when the state is entered.
      if (st !== a.prev) { a.doneAt = st === 'done' ? now : -1; a.prev = st; }
      const hop = a.doneAt >= 0 && !live.current.still && !reduce.matches ? hopAt((now - a.doneAt) / 1000) : null;
      const sw = 1 + swell * 0.05;
      const follow = `translate(${(a.bx * size) / UNITS_PER_SIZE}px, ${(a.by * size) / UNITS_PER_SIZE}px) `;
      const move = follow + (hop ? `translateY(${(hop.y * size) / 230}px) scale(${hop.x * sw}, ${hop.s * sw})` : `scale(${sw})`);
      mist.style.transformOrigin = face.style.transformOrigin = '50% 62%';
      mist.style.transform = move;
      face.style.transform = move;
      mist.style.filter = `blur(${(7 * size) / UNITS_PER_SIZE}px) brightness(${1 + swell * 0.35})`;
      face.style.filter = swell > 0.01 ? `brightness(${1 + swell * 0.2})` : '';

      // The crisp layer: voice bars, the face, dust, eyes.
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, px, px);
      fctx.setTransform(unit, 0, 0, unit, px / 2, px / 2);
      if (a.think * vis > 0.01) {
        // Thinking: specks with short trails fly in from every side and are taken in by the face.
        const sec = now / 1000;
        fctx.save();
        fctx.lineCap = 'round';
        fctx.shadowColor = 'rgba(32,231,170,.8)';
        fctx.shadowBlur = 0.03 * px;
        for (let i = 0; i < 12; i++) {
          const ang = ((i * 30 + (i % 2) * 9) * Math.PI) / 180;
          const p = ((((sec + (i * 0.37) % 2.2) % 2.2) + 2.2) % 2.2) / 2.2;
          const rad = 180 - 110 * p * p;
          const alpha = a.think * vis * (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8);
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const grad = fctx.createLinearGradient(ux * (rad + 24), uy * (rad + 24), ux * rad, uy * rad);
          grad.addColorStop(0, 'rgba(32,231,170,0)');
          grad.addColorStop(1, c2);
          fctx.globalAlpha = alpha * 0.8;
          fctx.strokeStyle = grad;
          fctx.lineWidth = 3.4;
          fctx.beginPath();
          fctx.moveTo(ux * (rad + 24), uy * (rad + 24));
          fctx.lineTo(ux * rad, uy * rad);
          fctx.stroke();
          fctx.globalAlpha = alpha;
          fctx.fillStyle = tone;
          fctx.beginPath();
          fctx.arc(ux * rad, uy * rad, 3.8 * (0.6 + 0.5 * p), 0, TAU);
          fctx.fill();
        }
        fctx.restore();
      }
      if (a.listen * vis > 0.01) {
        // Listening: soft rings close in on the face, one after another, like sound arriving.
        const sec = now / 1000;
        fctx.save();
        fctx.strokeStyle = c2;
        fctx.lineWidth = 2.3;
        fctx.shadowColor = 'rgba(32,231,170,.5)';
        fctx.shadowBlur = 0.061 * px;
        for (let i = 0; i < 3; i++) {
          const p = (((sec - i * 0.8) % 2.4) + 2.4) % 2.4 / 2.4;
          const radius = 60 + 102 * (1 - p) * (1 - p);
          fctx.globalAlpha = a.listen * vis * 0.75 * (p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82);
          fctx.beginPath();
          fctx.arc(0, 0, radius, 0, TAU);
          fctx.stroke();
        }
        fctx.restore();
      }
      if (a.speak * vis > 0.02) {
        // Mint to cyan with a soft glow, so the voice meter belongs with the rest of the Orb.
        fctx.save();
        fctx.shadowColor = 'rgba(32,231,170,.65)';
        fctx.shadowBlur = 0.03 * px;
        for (const bar of barHeights(a.level, t)) {
          const g = fctx.createLinearGradient(0, -bar.h / 2, 0, bar.h / 2);
          g.addColorStop(0, c2);
          g.addColorStop(1, c1);
          fctx.globalAlpha = 0.95 * a.speak * vis;
          fctx.fillStyle = g;
          fctx.beginPath();
          fctx.roundRect(bar.x - 2.7, -bar.h / 2, 5.4, bar.h, 2.7);
          fctx.fill();
        }
        fctx.restore();
      }
      if (vis > 0.01) {
        const r = 62;
        const wob = (th: number) => 1 + 0.012 * Math.sin(th * 3 + t * 1.3) + 0.01 * Math.sin(th * 5 - t * 1.9);
        const g = fctx.createRadialGradient(-6, -r * 0.4, 2, 0, 0, r * 1.25);
        g.addColorStop(0, '#143f4a');
        g.addColorStop(1, '#04101a');
        fctx.save();
        fctx.globalAlpha = vis;
        fctx.filter = `blur(${1.4 * unit}px)`;
        fctx.fillStyle = g;
        fctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const th = (i / 120) * TAU;
          const rr = r * wob(th);
          if (i) fctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr); else fctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
        }
        fctx.closePath();
        fctx.fill();
        fctx.restore();
      }
      stepAll(a.dust, dt);
      drawParticles(fctx, a.dust, c2);

      // Asleep: a bubble swells under the closed eyes, wobbles, and pops, the cartoon way of snoring.
      const moving = !live.current.still && !reduce.matches;
      if (st === 'asleep' && moving && a.gone > 0.9) {
        const p = (now / 1000 % 5.2) / 5.2;
        const keys: [number, number][] = [[0, 0], [0.55, 1], [0.68, 0.82], [0.8, 1.1], [0.82, 1.35], [1, 0]];
        let j = 1;
        while (keys[j][0] < p) j++;
        const f = (p - keys[j - 1][0]) / (keys[j][0] - keys[j - 1][0]);
        const sc = keys[j - 1][1] + (keys[j][1] - keys[j - 1][1]) * f * f * (3 - 2 * f);
        const alpha = (p < 0.8 ? 1 : p < 0.82 ? 1 - (p - 0.8) / 0.02 : 0) * Math.min(1, (a.gone - 0.9) / 0.1);
        if (sc > 0.02 && alpha > 0.01) {
          const R = 22.9 * sc;
          const bx = -3 + R;
          const by = 29;
          fctx.setTransform(unit, 0, 0, unit, px / 2, px / 2);
          fctx.save();
          fctx.globalAlpha = alpha;
          fctx.shadowColor = 'rgba(32,231,170,.35)';
          fctx.shadowBlur = 0.043 * px;
          const g = fctx.createRadialGradient(bx - R * 0.36, by - R * 0.44, 0, bx, by, R);
          g.addColorStop(0, 'rgba(255,255,255,.75)');
          g.addColorStop(0.55, 'rgba(191,248,243,.26)');
          g.addColorStop(1, 'rgba(191,248,243,.08)');
          fctx.fillStyle = g;
          fctx.strokeStyle = 'rgba(191,248,243,.75)';
          fctx.lineWidth = 2.3;
          fctx.beginPath();
          fctx.arc(bx, by, R, 0, TAU);
          fctx.fill();
          fctx.stroke();
          fctx.restore();
        }
      }

      // The eyes never break up; they float a little when the body is gone.
      const lift = -a.gone * 6 + Math.sin(t * 1.4) * 1.2 * (1 - a.gone);
      const k = 1.35;
      // A blink squashes the eyes shut quickly and opens them a little slower, instead of swapping them for an arc.
      const closing = shut && st !== 'asleep' && st !== 'done';
      a.lid += ((closing ? 1 : 0) - a.lid) * (1 - Math.exp(-dt * (closing ? 38 : 22)));
      const closed = st === 'asleep';
      const happy = st === 'done';
      const glowBase = st === 'listening' ? 0.75 : 0.5;
      for (const ex of live.current.hideEyes ? [] : [-18, 18]) {
        fctx.save();
        fctx.translate(ex * k + a.gx - a.bx, -2.7 + a.gy - a.by + lift); // the eyes keep their own place while the body follows
        if (closed || happy) {
          fctx.strokeStyle = tone;
          fctx.lineWidth = 3.4 * k;
          fctx.lineCap = 'round';
          fctx.beginPath();
          if (happy) { fctx.moveTo(-7 * k, 3 * k); fctx.quadraticCurveTo(0, -6 * k, 7 * k, 3 * k); } else { fctx.moveTo(-6 * k, 0); fctx.quadraticCurveTo(0, 6 * k, 6 * k, 0); }
          fctx.stroke();
        } else {
          fctx.scale(1, 1 - 0.94 * a.lid);
          fctx.save();
          fctx.filter = `blur(${4 * unit}px)`;
          fctx.globalAlpha = Math.min(1, glowBase + a.level * 0.4);
          fctx.fillStyle = c2;
          fctx.beginPath();
          fctx.ellipse(0, 0, (9 + a.level * 5) * k, (12 + a.level * 6) * k, 0, 0, TAU);
          fctx.fill();
          fctx.restore();
          const eye = fctx.createRadialGradient(-1.3 * k, -2.8 * k, 1, 0, 0, 9.4 * k * 0.9);
          eye.addColorStop(0, '#fff');
          eye.addColorStop(0.5, tone);
          eye.addColorStop(1, c2);
          fctx.fillStyle = eye;
          fctx.beginPath();
          fctx.ellipse(0, 0, 6.4 * k, 9.4 * k, 0, 0, TAU);
          fctx.fill();
          fctx.fillStyle = 'rgba(255,255,255,.9)';
          fctx.beginPath();
          fctx.ellipse(-1.6 * k, -3 * k, 1.8 * k, 2.6 * k, 0, 0, TAU);
          fctx.fill();
        }
        fctx.restore();
      }
      // Error: in short bursts the Orb tears into four bands that slide sideways, then snaps back.
      if (st === 'error' && !live.current.still && !reduce.matches) {
        const sec = now / 1000;
        const px230 = px / 230;
        BANDS.forEach(([top, bottom, amp], i) => {
          const p = ((((sec - i * 0.03) % 3.6) + 3.6) % 3.6) / 3.6;
          const k = p >= 0.15 && p < 0.17 ? 1 : p >= 0.17 && p < 0.19 ? -0.6 : p >= 0.19 && p < 0.22 ? 0.8 : p >= 0.56 && p < 0.58 ? -0.9 : p >= 0.58 && p < 0.6 ? 0.5 : p >= 0.6 && p < 0.63 ? 1 : 0;
          if (!k) return;
          const y0 = Math.floor(px * top);
          const h = Math.max(1, Math.floor(px * (bottom - top)));
          for (const [ctx, canvas] of [[mctx, mist], [fctx, face]] as const) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(canvas, 0, y0, px, h, amp * k * px230, y0, px, h);
          }
        });
      }
      a.idle = sleeping && a.gone > 0.995 && a.dust.length === 0;
      return a.idle && !(st === 'asleep' && moving); // the bubble keeps it running while asleep
    };

    const loop = (now: number) => {
      const settled = draw(now);
      if (settled) return;
      raf = requestAnimationFrame(loop);
    };
    const canMove = () => !live.current.still && !reduce.matches && !document.hidden && document.hasFocus();
    const start = () => {
      cancelAnimationFrame(raf);
      a.last = 0;
      if (!canMove()) {
        // Nothing may move: show the final picture of the current state at once.
        const sleeping = live.current.state === 'asleep' || live.current.dissolve;
        a.was = sleeping;
        a.gone = sleeping ? 1 : 0;
        a.dust.length = 0;
        a.speak = live.current.state === 'speaking' ? 1 : 0;
        a.lid = live.current.blink && live.current.state !== 'asleep' && live.current.state !== 'done' ? 1 : 0;
        draw(performance.now());
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    wake.current = start;
    start();
    document.addEventListener('visibilitychange', start);
    window.addEventListener('focus', start);
    window.addEventListener('blur', start);
    reduce.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('focus', start);
      window.removeEventListener('blur', start);
      reduce.removeEventListener('change', start);
    };
  }, [size]);

  // A change of state, a blink or a look has to show even when the loop is resting.
  useEffect(() => { wake.current(); }, [state, blink, look[0], look[1], still, dissolve]);

  return (
    <div aria-hidden="true" style={{ position: 'relative', width: size, height: size, overflow: 'visible' }}>
      <canvas ref={mistRef} style={{ position: 'absolute', inset: 0, width: size, height: size, filter: `blur(${(7 * size) / UNITS_PER_SIZE}px)` }} />
      <canvas ref={faceRef} style={{ position: 'absolute', inset: 0, width: size, height: size }} />
    </div>
  );
}
