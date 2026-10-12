/**
 * Phibe's snail, drawn in code (Canvas 2D) in a 200 x 200 box, seen from the front and a little
 * from the side: a big round head with a wide smile and big eyes sitting right on top, a plump
 * body, and the teal golden-spiral shell of the floating button on its back. Style direction
 * comes from the user's references; the drawing itself is our own. The whole look is a function
 * of a "pose" (numbers), so the engine only has to animate the numbers.
 */

export interface SnailPose {
  /** Where the eyes look, -1 to 1 (right/down are positive). */
  lookX: number;
  lookY: number;
  /** 0 open, 1 shut. */
  blink: number;
  /** 0 resting smile, 1 wide open mouth. */
  mouth: number;
  /** 0 normal eyes, 1 happy arcs. */
  happy: number;
  /** Eyebrows raised, 0 to 1. */
  brow: number;
  /** Eyestalks swaying, -1 to 1. */
  sway: number;
  /** Breathing: the whole body rises by this many units. */
  bob: number;
  /** Squash and stretch, -1 (tall) to 1 (flat). */
  squash: number;
  /** The heart bubble: 0 hidden, 1 shown (may overshoot). */
  heart: number;
  /** Tilt of the whole snail in radians. */
  tilt: number;
}

export const REST_POSE: SnailPose = {
  lookX: 0, lookY: 0, blink: 0, mouth: 0, happy: 0, brow: 0, sway: 0, bob: 0, squash: 0, heart: 0, tilt: 0,
};

const INK = '#14123f';
const GOLDEN = 1.618;

function bodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(178, 177);
  ctx.lineTo(62, 177);
  ctx.quadraticCurveTo(30, 177, 30, 146);
  ctx.bezierCurveTo(28, 112, 40, 84, 70, 80);
  ctx.bezierCurveTo(102, 76, 116, 108, 116, 138);
  ctx.bezierCurveTo(116, 152, 124, 158, 140, 158);
  ctx.lineTo(160, 158);
  ctx.quadraticCurveTo(176, 160, 178, 177);
  ctx.closePath();
}

/** Golden spiral (it grows by the golden ratio every quarter turn), two turns, as on the floating button's shell. */
function spiral(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.beginPath();
  for (let a = Math.PI; a <= Math.PI * 4.2; a += 0.06) {
    const r = 0.7 * GOLDEN ** (a / (Math.PI / 2));
    const x = cx + Math.cos(a + 0.6) * r;
    const y = cy + Math.sin(a + 0.6) * r;
    if (a === Math.PI) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pose: SnailPose): void {
  if (pose.happy > 0.5) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + 6, r * 0.6, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    return;
  }
  const open = Math.max(0.08, 1 - 0.92 * pose.blink);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, open);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const px = pose.lookX * r * 0.3;
  const py = pose.lookY * r * 0.3;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(px, py, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(96, 120, 235, 0.9)';
  ctx.beginPath();
  ctx.arc(px - r * 0.18, py + r * 0.22, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px + r * 0.18, py - r * 0.24, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + r * 0.3, py + r * 0.12, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function heartBubble(ctx: CanvasRenderingContext2D, scale: number): void {
  if (scale <= 0.02) return;
  ctx.save();
  ctx.translate(158, 32);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 11);
  ctx.lineTo(-16, 22);
  ctx.lineTo(-2, 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff2d6f';
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-13, -1, -8, -10, 0, -4);
  ctx.bezierCurveTo(8, -10, 13, -1, 0, 8);
  ctx.fill();
  ctx.restore();
}

/** Draws the snail into a `size` x `size` square at the origin of the context. */
export function drawSnail(ctx: CanvasRenderingContext2D, size: number, pose: SnailPose): void {
  ctx.save();
  ctx.scale(size / 200, size / 200);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Soft shadow on the ground.
  ctx.fillStyle = 'rgba(32, 231, 170, 0.22)';
  ctx.beginPath();
  ctx.ellipse(104, 181, 78, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Everything else moves together: breathing, squash and tilt around the foot.
  ctx.translate(104, 177);
  ctx.rotate(pose.tilt);
  ctx.scale(1 + pose.squash * 0.06, 1 - pose.squash * 0.1);
  ctx.translate(-104, -177 - pose.bob);

  // Shell (behind the head), drawn like the floating button's: a mint-to-teal coil with a dark
  // teal outline and a double-line golden spiral.
  const SHELL_INK = '#0b3b38';
  const sx = 137;
  const sy = 102;
  const sr = 44;
  ctx.fillStyle = '#0f9488';
  ctx.strokeStyle = SHELL_INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(sx + 2, 142, 41, 17, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const coil = ctx.createRadialGradient(sx - 0.3 * sr, sy - 0.4 * sr, 0, sx - 0.3 * sr, sy - 0.4 * sr, 1.7 * sr);
  coil.addColorStop(0, '#8bf2de');
  coil.addColorStop(0.5, '#34d8c0');
  coil.addColorStop(1, '#0f9e90');
  ctx.fillStyle = coil;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(-0.9, -1.2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2.2;
  spiral(ctx, sx + 2, sy + 2);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = SHELL_INK;
  ctx.lineWidth = 3.4;
  spiral(ctx, sx + 2, sy + 2);
  ctx.stroke();

  // Body and head.
  const body = ctx.createLinearGradient(0, 80, 0, 177);
  body.addColorStop(0, '#ffe9cc');
  body.addColorStop(1, '#f6c38f');
  bodyPath(ctx);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  ctx.fillStyle = 'rgba(232, 160, 100, 0.8)';
  ctx.fillRect(0, 167, 200, 20);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.ellipse(62, 158, 30, 13, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  bodyPath(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Freckles.
  ctx.fillStyle = 'rgba(190, 120, 70, 0.5)';
  ctx.beginPath();
  ctx.ellipse(96, 126, 6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(86, 142, 4, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(99, 142, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth: a wide smile with a tongue, opening when it talks.
  const depth = 11 + pose.mouth * 9 + pose.happy * 4;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(52, 110);
  ctx.quadraticCurveTo(70, 110 + depth * 2, 88, 110);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7fa3';
  ctx.beginPath();
  ctx.ellipse(70, 110 + depth * 0.98, 8, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes sitting on short stalks, big and close together.
  const sway = pose.sway * 2.5;
  const eyes = [
    { bx: 60, ex: 62 + sway, ey: 62 - pose.sway * 1.2, r: 20 },
    { bx: 82, ex: 94 + sway, ey: 64 + pose.sway * 1.2, r: 21 },
  ];
  for (const e of eyes) {
    ctx.beginPath();
    ctx.moveTo(e.bx, 88);
    ctx.lineTo(e.ex, e.ey + e.r * 0.7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = '#fbd1a0';
    ctx.lineWidth = 4.8;
    ctx.stroke();
  }
  for (const e of eyes) eye(ctx, e.ex, e.ey, e.r, pose);

  // Eyebrows.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.8;
  const lift = pose.brow * 7;
  for (const e of eyes) {
    ctx.beginPath();
    ctx.arc(e.ex, e.ey - e.r - 7 - lift + 11, 10, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  ctx.restore();

  // The heart bubble floats free of the body's squash.
  ctx.save();
  ctx.scale(size / 200, size / 200);
  heartBubble(ctx, pose.heart);
  ctx.restore();
}
