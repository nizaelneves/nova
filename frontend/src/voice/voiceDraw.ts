/**
 * What the voice pill draws: a small matrix of dots (12 x 3) and the few things beside it. Plain canvas drawing with
 * no state of its own, so the pill can call it once per frame. Everything is Phibe green.
 */

export const COLS = 12;
export const ROWS = 3;
export const DOTS_W = 92;
export const DOTS_H = 26;

const TAU = Math.PI * 2;
const MINT = '#20e7aa';
const CYAN = '#10c3d3';
const SOFT = '#d9fff3';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** How the dust and the check of the "sent" animation are timed, in seconds from its start (it lasts about 3.2). */
export const SENT_SECONDS = 3.3;

// --- Fibonacci: the number shown while a message is sent ---------------------------------------------------------

/** 0, 1, 1, 2, 3, 5 ... up to 75025 (5 digits), then it starts over from zero. */
export const FIB: number[] = (() => {
  const seq = [0, 1];
  while (seq[seq.length - 1] + seq[seq.length - 2] <= 75025) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  return seq;
})();

/** Seconds each number stays before the next one. */
export const FIB_STEP = 0.7;

/** The number to show `seconds` after sending began. */
export const fibAt = (seconds: number): number => FIB[Math.floor(Math.max(0, seconds) / FIB_STEP) % FIB.length];

// --- the dots ----------------------------------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

const wob = (t: number, i: number, k = 1) => 0.55 + 0.45 * Math.sin(t * 6 * k + i * 1.7);
const tone = (i: number) => (i % 4 === 3 ? MINT : CYAN);
/** A fixed pseudo-random number per dot, so the dust always scatters the same way. */
const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function dot(c: Ctx, i: number, j: number, alpha: number, color: string, radius = 2): void {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.arc(4 + i * 7.6, 4.5 + j * 8.5, radius, 0, TAU);
  c.fill();
}

/** Listening: the dots light up from the bottom with the voice. */
export function drawListen(c: Ctx, level: number, t: number, dim = 1): void {
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) dot(c, i, j, ((2 - j) / 3 + 0.05 < level * wob(t, i * 1.3) * 1.15 ? 1 : 0.14) * dim, tone(i));
  }
  c.globalAlpha = 1;
}

/** Waiting for the microphone: all the dots rest, breathing a little. */
export function drawIdle(c: Ctx, t: number): void {
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) dot(c, i, j, 0.14 + 0.1 * Math.sin(t * 2 + i * 0.5), tone(i));
  c.globalAlpha = 1;
}

/** Sending: a diagonal wave of light crosses the dots. */
export function drawSend(c: Ctx, t: number): void {
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) dot(c, i, j, 0.14 + 0.86 * Math.max(0, Math.sin(t * 5 - (i + j * 2) * 0.55)), tone(i));
  }
  c.globalAlpha = 1;
}

/** Sent: the dots come apart like dust and blow away to the right. `p` is the seconds since it began. */
export function drawDust(c: Ctx, p: number): void {
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const k = i * 3 + j;
      const d = clamp((p - 0.5 - (COLS - i) * 0.05 - rand(k) * 0.3) / 1.3, 0, 1);
      const x = 4 + i * 7.6 + d * (16 + rand(k + 3) * 22);
      const y = 4.5 + j * 8.5 + (rand(k + 5) - 0.5) * d * 16;
      c.globalAlpha = clamp(1 - d, 0, 1) * 0.9 + (d === 0 ? 0.1 : 0);
      c.fillStyle = k % 2 ? MINT : CYAN;
      c.beginPath();
      c.arc(x, y, 2 * (1 - d * 0.6), 0, TAU);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

/** Speaking (Phibe's voice): a sine wave of dots that moves with how loud she is. */
export function drawWave(c: Ctx, level: number, t: number): void {
  for (let i = 0; i < COLS; i++) {
    const y = 1 + Math.sin(t * 5 + i * 0.6) * (0.4 + level * 0.9);
    for (let j = 0; j < ROWS; j++) dot(c, i, j, clamp(1 - Math.abs(j - y) * 0.75, 0.12, 1), i % 4 === 3 ? SOFT : MINT);
  }
  c.globalAlpha = 1;
}

// --- the little things beside the dots ---------------------------------------------------------------------------

export const MARK = { w: 30, h: 26 };
export const SPARKS = { w: 32, h: 28 };

/** Sent: a check mark drawn stroke by stroke after the dust, then it fades. */
export function drawCheck(c: Ctx, p: number): void {
  const f = (p - 1.2) / 0.5;
  const fade = 1 - clamp((p - 2.9) / 0.4, 0, 1);
  if (f <= 0 || fade <= 0) return;
  const x = MARK.w / 2;
  const y = MARK.h / 2;
  const s = 12;
  const pts = [[-0.5, 0.05], [-0.12, 0.42], [0.55, -0.4]];
  const f1 = clamp(f / 0.4, 0, 1);
  const f2 = clamp((f - 0.4) / 0.6, 0, 1);
  c.save();
  c.globalAlpha = fade;
  c.shadowColor = MINT;
  c.shadowBlur = 8;
  c.strokeStyle = MINT;
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
  c.lineTo(x + (pts[0][0] + (pts[1][0] - pts[0][0]) * f1) * s, y + (pts[0][1] + (pts[1][1] - pts[0][1]) * f1) * s);
  if (f2 > 0) c.lineTo(x + (pts[1][0] + (pts[2][0] - pts[1][0]) * f2) * s, y + (pts[1][1] + (pts[2][1] - pts[1][1]) * f2) * s);
  c.stroke();
  c.restore();
}

const SPARK_SPOTS: [number, number, number][] = [[7, 8, 0], [17, 18, 1.3], [25, 7, 2.6], [11, 20, 3.9], [22, 14, 5.2]];

/** Speaking: little stars that light up and go out at different times, like fireflies. */
export function drawSparks(c: Ctx, t: number): void {
  for (const [x, y, phase] of SPARK_SPOTS) {
    const s = Math.max(0, Math.sin(t * 2.4 + phase)) ** 2;
    if (s < 0.02) continue;
    const r = 1 + s * 4.5;
    c.globalAlpha = s;
    c.strokeStyle = phase > 2.5 && phase < 4 ? MINT : phase > 1 && phase < 2 ? '#8fe3ff' : SOFT;
    c.lineWidth = 1.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - r, y);
    c.lineTo(x + r, y);
    c.moveTo(x, y - r);
    c.lineTo(x, y + r);
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(x, y, 0.8, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}
