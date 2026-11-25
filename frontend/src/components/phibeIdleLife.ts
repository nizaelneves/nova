/**
 * Phibe's life when you are away: what she does while she is awake and alone, the stages of getting sleepy and sleeping, and
 * how she wakes up. It does not draw her body: it says how to bend it (a `Pose`, read by the nebula on every frame) and draws
 * the little things around her (notes, bubbles, a star, dust, Zzzz, sparks) on the same canvas.
 *
 * What she does: she looks around (the usual), sometimes blows bubbles or follows a star, and, while music plays, hums or
 * dances. Sleepy: she nods off. Then a yawn and a stretch, and a curled-up sleep; deep asleep she breaks into dust with a Zzzz.
 * Waking from deep sleep a lamp tries to turn on (three tries, the third catches); from a lighter sleep she just opens her eyes.
 */
import { takeWake } from '../lib/phibeActivity';
import { PHASE_START, REST, clamp, durationOf, ease, pickBehavior, ramp, sleepEnv, type Behavior, type SleepEnv } from '../lib/phibeIdle';

export interface Pose {
  /** Where the body goes, in drawing units, on top of where it already is. */
  bx: number; by: number;
  /** Head tilt in degrees. */
  tilt: number;
  /** Eyelids: 0 open, 1 closed (a sleeping curve from 0.72 on). */
  lid: number;
  /** Scales of the whole body (they multiply). */
  size: number; sx: number; sy: number;
  /** How much of the dark body and its mist is there (0 breaks into dust), and how bright the light is. */
  mist: number; bright: number;
  /** Where the eyes look, in drawing units, and how fast they get there (0: as usual). */
  gx: number; gy: number; ease: number;
  /** How fast the cloud turns (1 usual). */
  spin: number;
  /** Eyes as a lit crescent (0 to 1) and with little glints (0 to 1). */
  crescent: number; sparkle: number;
  /** She is in charge of where the eyes look (the cursor is ignored). */
  takeGaze: boolean;
  /** Blink now. */
  blink: boolean;
}

const neutral = (): Pose => ({ bx: 0, by: 0, tilt: 0, lid: 0, size: 1, sx: 1, sy: 1, mist: 1, bright: 1, gx: 0, gy: 0, ease: 0, spin: 1, crescent: 0, sparkle: 0, takeGaze: false, blink: false });

export interface IdleInput { idle: number; music: boolean; enabled: boolean; px: number; py: number }
export interface IdleLife { update(dt: number, input: IdleInput): Pose; draw(g: CanvasRenderingContext2D): void; reset(): void }

interface Part { kind: 'txt' | 'dot' | 'spark' | 'bub'; x: number; y: number; vx: number; vy: number; l: number; life: number; size: number; txt?: string; col?: string; rgb?: string; sway?: number; pull?: number; die?: boolean; pop?: boolean; bold?: boolean }

const TAU = Math.PI * 2;
const CX = 180;
const CY = 140;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const fade = (s: number, D: number, a = 0.7, b = 0.7) => ease(ramp(s, 0, a)) * (1 - ease(ramp(s, D - b, D)));

export function createIdleLife(): IdleLife {
  let parts: Part[] = [];
  let st: Record<string, number> = {};
  let trail: { x: number; y: number }[] = [];
  let dt = 0.016;
  let t = 0;
  let px = CX;
  let py = CY;
  let ocW = 0;
  const dir: { cur: Behavior | null; s: number; D: number; gap: number; last: Behavior | null } = { cur: null, s: 0, D: 0, gap: 0.6, last: null };
  let wake: { kind: 'lamp' | 'quick'; t: number; snap: SleepEnv } | null = null;
  let overlay: ((g: CanvasRenderingContext2D) => void) | null = null;

  const add = (p: Partial<Part> & Pick<Part, 'kind' | 'x' | 'y'>) => parts.push({ vx: 0, vy: 0, l: 1, life: 3, size: 3, ...p });
  const spark = (x: number, y: number, vx: number, vy: number, size = 2, life = 1.4, rgb = '32,231,170') => add({ kind: 'spark', x, y, vx, vy, size, life, rgb });
  const every = (key: string, secs: number, fn: () => void) => { st[key] = (st[key] ?? secs) - dt; if (st[key] <= 0) { st[key] += secs; fn(); } };
  const note = (size = 17) => add({ kind: 'txt', txt: Math.random() < 0.5 ? '♪' : '♫', x: px + rnd(30, 56), y: py - 20, vx: 10, vy: -22, size, life: 2.6, col: Math.random() < 0.5 ? '#bff8f3' : '#20e7aa', sway: 8, pop: true });

  /* ---------- sleep: the stages ---------- */
  const sleepPose = (P: Pose, e: { drowsy: number; yawn: number; asleep: number; deep: number; shake: number }) => {
    const y = e.yawn, a = e.asleep, d = e.deep;
    P.lid = Math.max(P.lid, y * 0.85 + e.drowsy * 0.4 + a * 0.5 + d * 0.6);
    P.sy *= 1 + 0.2 * y; P.sx *= 1 - 0.1 * y;
    P.by += -8 * y + 22 * a * (1 - d) + 4 * d;
    P.size *= 1 - 0.28 * a * (1 - d) - 0.05 * d;
    P.bright *= 1 - 0.5 * a * (1 - d) - 0.3 * d;
    P.spin *= 1 - 0.7 * a * (1 - d) - 0.6 * d;
    P.mist *= 1 - 0.95 * d;
    if (e.shake) P.bx += Math.sin(t * 40) * 5 * e.shake;
  };
  /** Nodding: the head drops, she jerks awake wide-eyed, and drops again. */
  const nod = (P: Pose, e: SleepEnv) => {
    const ph = (t / 2.6) % 1, dip = ph < 0.75 ? ease(ph / 0.75) : 0, jerk = ph < 0.1 ? 1 - ph / 0.1 : 0, d = e.drowsy * (1 - e.asleep);
    P.by += 20 * dip * d;
    P.lid = Math.max(P.lid, (0.25 + 0.6 * dip) * d) * (1 - 0.9 * jerk * d);
    P.size *= 1 + 0.07 * jerk * d;
    P.tilt += 6 * dip * e.drowsy;
  };
  /** Deep asleep: the body is dust drifting off, and a Zzzz rises. */
  const deepStuff = (d: number) => {
    if (d > 0.1 && d < 0.999) for (let i = 0; i < 3; i++) { const an = Math.random() * TAU, r = Math.random() * 70; add({ kind: 'dot', x: px + Math.cos(an) * r * 1.2, y: py + Math.sin(an) * r * 0.85, vx: rnd(5, 28), vy: rnd(-22, -4), life: rnd(2, 4.5), size: 2 + Math.random() * 1.6, col: Math.random() < 0.5 ? '#20e7aa' : '#10c3d3' }); }
    if (d > 0.7) every('zz', 0.7, () => { const k = (st.zk = ((st.zk ?? -1) + 1) % 4); if (k === 3) return; add({ kind: 'txt', txt: k === 0 ? 'z' : 'Z', x: px + 30 + k * 11, y: py - 28 - k * 14, vx: 9, vy: -13, size: [12, 16, 22][k], life: 3.4, bold: true, col: '#bff8f3', sway: 5, pop: true }); });
  };

  /* ---------- what she does by lot ---------- */
  const puffPose = (P: Pose, puff: number, w: number) => { P.size *= 1 + 0.07 * puff * w; P.lid += 0.5 * puff * w; P.bx -= 6 * puff * w; P.gx += 5 * w; };
  const look = (P: Pose, w: number) => {
    const g = (k: string, d = 0) => st[k] ?? d;
    st.lt = g('lt') - dt;
    if (st.lt <= 0) {
      st.lt = rnd(1, 2.3);
      const c = [[-1, -0.2], [0.9, -0.3], [0.5, 0.6], [-0.6, 0.5], [0, -0.7], [1, 0.2], [-0.9, 0.4]], n = c[Math.floor(Math.random() * c.length)];
      st.lgx = n[0]; st.lgy = n[1];
      if (Math.random() < 0.35) P.blink = true;
    }
    const k = 1 - Math.exp(-dt * 2.4);
    st.lsx = g('lsx') + (g('lgx') - g('lsx')) * k; st.lsy = g('lsy') + (g('lgy') - g('lsy')) * k;
    P.ease = 0.5; P.gx += g('lgx') * 13 * w; P.gy += g('lgy') * 9 * w;
    P.bx += g('lsx') * 16 * w; P.by += g('lsy') * 9 * w; P.tilt += g('lsx') * 10 * w;
  };
  const bubbles = (P: Pose, s: number, w: number) => {
    const C = 4.4, ph = s % C, on = ph > 0.5 && ph < 2.3;
    puffPose(P, on ? 0.5 + 0.5 * Math.abs(Math.sin(ph * 9)) : ease(clamp(ph / 0.5, 0, 1)) * 0.5, w);
    if (on && w > 0.3) { st.bn = (st.bn ?? 0) - dt; if (st.bn <= 0) { st.bn = 0.34; add({ kind: 'bub', x: px + 50, y: py - 4, vx: rnd(8, 26), vy: rnd(-26, -12), size: rnd(4, 9), life: rnd(2, 3.6), sway: 8 }); } }
  };
  const star = (P: Pose, s: number, w: number) => {
    const a = s * 1.5, x = CX + Math.cos(a) * 118, y = CY + Math.sin(a * 1.3) * 62, ph = s % 3.2, lunge = ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : 0;
    st.sx = x; st.sy = y; st.fl = lunge;
    P.ease = 0.35; P.gx += clamp((x - CX) / 12, -1, 1) * 11 * w; P.gy += clamp((y - CY) / 9, -1, 1) * 8 * w;
    P.bx += (x - CX) * (0.12 + 0.3 * lunge) * w; P.by += (y - CY) * (0.12 + 0.3 * lunge) * w; P.size *= 1 + 0.05 * lunge * w;
    every('tr', 0.05, () => { if (w > 0.2) spark(x, y, 0, 0, 1.1, 0.55, '143,244,230'); });
    overlay = (g) => {
      const wx = w, X = st.sx, Y = st.sy, pulse = 1 + 0.5 * (st.fl ?? 0);
      glow(g, X, Y, 20 * pulse, '255,255,255', 0.5 * wx); glow(g, X, Y, 34 * pulse, '143,244,230', 0.25 * wx); star4(g, X, Y, 8 * pulse, t * 1.6, wx);
    };
  };
  const hum = (P: Pose, s: number, w: number) => {
    const b = Math.sin(s * TAU * 0.55);
    P.by -= Math.abs(b) * 8 * w; P.tilt += b * 7 * w; P.bx += Math.sin(s * TAU * 0.275) * 14 * w; P.crescent = Math.max(P.crescent, w);
    P.gx += b * 4 * w; P.sy *= 1 + Math.abs(b) * 0.05 * w;
    every('n', 0.95, () => { if (w > 0.3) note(); });
  };
  const dance = (P: Pose, s: number, w: number) => {
    const b = s * TAU * 0.6;
    P.bx += Math.sin(b) * 30 * w; P.by += Math.sin(2 * b) * 10 * w; P.tilt += Math.cos(b) * 9 * w; P.sparkle = Math.max(P.sparkle, 0.95 * w); P.gx += Math.cos(b) * 8 * w;
    every('tail', 0.05, () => { trail.push({ x: px, y: py }); if (trail.length > 26) trail.shift(); });
    overlay = (g) => trail.forEach((q, i) => glow(g, q.x, q.y + 18, 7 + i * 0.25, i % 2 ? '143,244,230' : '32,231,170', (i / trail.length) * 0.35 * w));
  };
  const behave = (kind: Behavior, s: number, w: number, P: Pose) => {
    if (kind === 'look') look(P, w); else if (kind === 'bubbles') bubbles(P, s, w); else if (kind === 'star') star(P, s, w); else if (kind === 'hum') hum(P, s, w); else dance(P, s, w);
  };

  /* ---------- waking: a lamp that tries to turn on (three tries, the third catches) ---------- */
  const TRIES: [number, number, number][] = [[3.0, 3.25, 0.3], [3.9, 4.35, 0.5], [4.9, 5.7, 0.8]];
  const LAMP_END = 8.4;
  const lamp = (P: Pose, T: number) => {
    const e = { drowsy: 0, yawn: 0, asleep: 1 - ramp(T, 3, 4.5), deep: 1 - ramp(T, 3, 4.5), shake: 0 };
    sleepPose(P, e);
    let on = ramp(T, 5.7, 6.2);
    for (const [a, b, v] of TRIES) if (T > a && T < b) on = Math.max(on, v * (0.7 + 0.3 * Math.sin((T - a) * 30)));
    const sigh = T > 6.2 ? Math.sin(clamp((T - 6.2) / 1.4, 0, 1) * Math.PI) : 0;
    P.mist = Math.max(P.mist, on); P.bright = 0.6 + 0.5 * on + 0.3 * sigh; P.size *= 1 + 0.06 * sigh;
    P.lid = 1 - ramp(T, 6.0, 7.6);
    deepStuff(e.deep);
    if (T > 3 && T < 4.5) for (const q of parts) if (q.kind !== 'spark') { q.pull = 3; q.die = true; }
    TRIES.forEach(([a], i) => { if (T > a && !st['try' + i]) { st['try' + i] = 1; for (let k = 0; k < 3 + i * 2; k++) spark(px + rnd(-20, 20), py - 28, rnd(-40, 40), rnd(-60, -10), 1.2, 0.6, '143,244,230'); } });
  };

  const reset = () => { parts = []; st = {}; trail = []; dir.cur = null; dir.gap = 0.6; ocW = 0; wake = null; overlay = null; };

  return {
    reset,
    update(dtIn, input) {
      dt = Math.min(0.05, dtIn); t += dt; px = input.px; py = input.py;
      const P = neutral();
      overlay = null;
      if (!input.enabled) { if (parts.length || wake || ocW) reset(); return P; }

      // Disturbed after a long time alone: wake up the way that fits how deep she was.
      const was = takeWake();
      if (was >= PHASE_START.sonolenta) { wake = { kind: was >= PHASE_START.profundo ? 'lamp' : 'quick', t: was >= PHASE_START.profundo ? 3 : 0, snap: sleepEnv(was) }; st = {}; dir.cur = null; ocW = 0; }

      let env: SleepEnv = sleepEnv(input.idle);
      if (wake) {
        wake.t += dt;
        if (wake.kind === 'quick') {
          const k = 1 - ease(ramp(wake.t, 0, 0.9)), s = wake.snap;
          env = { oc: 0, drowsy: s.drowsy * k, yawn: 0, asleep: s.asleep * k, shake: 0, deep: s.deep * k };
          P.by -= 8 * Math.sin(clamp(wake.t / 0.5, 0, 1) * Math.PI);
          if (wake.t > 1) wake = null;
        } else if (wake.t > LAMP_END) wake = null;
      }

      // What she does while she is awake and alone.
      ocW += (env.oc - ocW) * (1 - Math.exp(-dt * 5));
      if (ocW > 0.02 && !wake) {
        if (!dir.cur) {
          dir.gap -= dt;
          if (dir.gap <= 0) { const k = pickBehavior(Math.random, input.music, dir.last); dir.cur = k; dir.last = k; dir.s = 0; dir.D = durationOf(k, Math.random); st = {}; trail = []; }
        } else {
          dir.s += dt;
          if (dir.s >= dir.D) { dir.cur = null; dir.gap = REST[0] + Math.random() * (REST[1] - REST[0]); }
        }
        if (dir.cur) behave(dir.cur, dir.s, fade(dir.s, dir.D) * ocW, P);
        // Humming and dancing end as soon as the music stops.
        if (!input.music && (dir.cur === 'hum' || dir.cur === 'dance')) dir.s = Math.max(dir.s, dir.D - 0.7);
      } else if (ocW <= 0.02) { dir.cur = null; }

      // Sleepy, asleep, and waking.
      if (wake && wake.kind === 'lamp') lamp(P, wake.t);
      else {
        sleepPose(P, env);
        if (env.drowsy > 0.01 && env.asleep < 1) nod(P, env);
        deepStuff(env.deep);
      }
      P.takeGaze = ocW > 0.05 || env.drowsy > 0.01 || wake !== null;

      // The little things around her.
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        if (q.pull) { q.vx += (px - q.x) * q.pull * dt; q.vy += (py - q.y) * q.pull * dt; q.vx *= 0.96; q.vy *= 0.96; }
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.sway) q.vx += Math.sin(q.y * 0.05) * q.sway * dt;
        q.l -= dt / q.life;
        if (q.l <= 0 || (q.die && Math.hypot(q.x - px, q.y - py) < 8)) {
          if (q.kind === 'bub' && q.l <= 0) { const n = Math.round(5 + q.size * 0.7); for (let k = 0; k < n; k++) { const an = (k / n) * TAU, v = rnd(20, 46); spark(q.x + Math.cos(an) * q.size * 0.7, q.y + Math.sin(an) * q.size * 0.7, Math.cos(an) * v, Math.sin(an) * v, 1.3, 0.7, k % 2 ? '143,244,230' : '32,231,170'); } }
          parts.splice(i, 1);
        }
      }
      if (parts.length > 160) parts.splice(0, parts.length - 160);
      return P;
    },
    draw(g) {
      for (const q of parts) {
        const a = Math.min(1, q.l * 1.5);
        if (q.kind === 'txt') {
          g.save(); g.globalAlpha = a * 0.9; g.fillStyle = q.col ?? '#20e7aa';
          g.font = `${q.bold ? 700 : 600} ${q.size * (q.pop ? 0.6 + 0.4 * Math.min(1, (1 - q.l) * 6) : 1)}px ui-monospace, Consolas, monospace`; g.textAlign = 'center'; g.fillText(q.txt ?? '', q.x, q.y); g.restore();
        } else if (q.kind === 'spark') {
          glow(g, q.x, q.y, q.size * 3.5, q.rgb ?? '32,231,170', a * 0.8); g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(q.x, q.y, q.size * 0.5, 0, TAU); g.fill();
        } else if (q.kind === 'bub') {
          const r = q.size * (1 + (1 - q.l) * 0.25);
          g.save(); g.globalAlpha = Math.min(1, a * 1.1) * 0.95;
          const bg = g.createRadialGradient(q.x - r * 0.3, q.y - r * 0.3, r * 0.1, q.x, q.y, r); bg.addColorStop(0, 'rgba(217,255,243,.22)'); bg.addColorStop(0.7, 'rgba(32,231,170,.10)'); bg.addColorStop(1, 'rgba(16,195,211,.38)');
          g.fillStyle = bg; g.beginPath(); g.arc(q.x, q.y, r, 0, TAU); g.fill();
          const rim = g.createLinearGradient(q.x - r, q.y - r, q.x + r, q.y + r); rim.addColorStop(0, 'rgba(217,255,243,.95)'); rim.addColorStop(0.5, 'rgba(143,244,230,.5)'); rim.addColorStop(1, 'rgba(80,190,255,.85)');
          g.strokeStyle = rim; g.lineWidth = 1.3; g.stroke();
          g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(q.x - r * 0.42, q.y - r * 0.42, r * 0.2, r * 0.12, -0.7, 0, TAU); g.fill(); g.restore();
        } else { g.globalAlpha = a * 0.9; g.fillStyle = q.col ?? '#20e7aa'; g.fillRect(q.x, q.y, q.size, q.size); g.globalAlpha = 1; }
      }
      overlay?.(g);
    },
  };
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, a: number): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${c},${a})`);
  gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function star4(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, a: number): void {
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath();
  for (let k = 0; k < 8; k++) { const an = (k / 8) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.28 : r; if (k) g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); else g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); }
  g.closePath(); g.fill(); g.restore();
}
