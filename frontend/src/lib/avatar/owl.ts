/**
 * Phibe's owl (floating-button avatar), drawn in code in a 200 x 200 box, from the approved sketch
 * in docs/design/owl/owl.svg: teal body, white face, peach belly, mint-ringed eyes, tiny teal glasses.
 * Same rules as the snail: the whole look is a function of a pose.
 */
import type { AvatarPose } from './registry';

const INK = '#14123f';

function fillStroke(ctx: CanvasRenderingContext2D, path: Path2D, fill: string | CanvasGradient, width: number): void {
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke(path);
}

function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, pose: AvatarPose): void {
  const shut = pose.blink > 0.85 || pose.happy > 0.5;
  if (shut) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 17, cy + 2);
    ctx.quadraticCurveTo(cx, cy + 16, cx + 17, cy + 2);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.12, 1 - 0.9 * pose.blink));
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, Math.PI * 2);
  ctx.fillStyle = '#20e7aa';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const px = pose.lookX * 3;
  const py = pose.lookY * 3;
  const pupil = ctx.createRadialGradient(px - 3.3, py - 4.6, 0, px - 3.3, py - 4.6, 26);
  pupil.addColorStop(0, '#2c2a78');
  pupil.addColorStop(1, '#0d0b2e');
  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.arc(px, py, 16.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(96, 120, 235, 0.55)';
  ctx.beginPath();
  ctx.arc(px + 2, py + 9, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - 5.5, py - 6.5, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(px + 6.5, py + 6, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws the owl into a `size` x `size` square at the origin of the context. */
export function drawOwl(ctx: CanvasRenderingContext2D, size: number, pose: AvatarPose): void {
  ctx.save();
  ctx.scale(size / 200, size / 200);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(32, 231, 170, 0.22)';
  ctx.beginPath();
  ctx.ellipse(100, 184, 52, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Breathing, squash and tilt around the feet.
  ctx.translate(100, 184);
  ctx.rotate(pose.tilt);
  ctx.scale(1 + pose.squash * 0.06, 1 - pose.squash * 0.1);
  ctx.translate(-100, -184 - pose.bob);

  // Feet.
  for (const d of ['M64,178 Q64,170 76,170 Q92,170 92,178 Q92,184 64,184 Z', 'M108,178 Q108,170 124,170 Q136,170 136,178 Q136,184 108,184 Z']) {
    fillStroke(ctx, new Path2D(d), '#f6bd8a', 3);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.stroke(new Path2D('M70,184 v3 M78,184 v3 M86,184 v3 M114,184 v3 M122,184 v3 M130,184 v3'));

  // Wings, behind the body.
  fillStroke(ctx, new Path2D('M46,96 C26,112 24,148 40,166 C46,172 54,170 56,160 C60,140 58,118 56,100 Z'), linear(ctx, 24, 96, 58, 172, [[0, '#20c4b0'], [1, '#0b6f66']]), 3.2);
  fillStroke(ctx, new Path2D('M154,96 C174,112 176,148 160,166 C154,172 146,170 144,160 C140,140 142,118 144,100 Z'), linear(ctx, 142, 96, 176, 172, [[0, '#20c4b0'], [1, '#0b6f66']]), 3.2);
  ctx.strokeStyle = 'rgba(11, 59, 56, 0.55)';
  ctx.lineWidth = 2.2;
  ctx.stroke(new Path2D('M36,132 Q44,138 50,152 M33,118 Q42,124 48,136 M164,132 Q156,138 150,152 M167,118 Q158,124 152,136'));

  // Body and head in one.
  fillStroke(
    ctx,
    new Path2D('M100,20 C150,20 172,58 170,100 C168,150 142,178 100,178 C58,178 32,150 30,100 C28,58 50,20 100,20 Z'),
    linear(ctx, 0, 20, 0, 178, [[0, '#8bf2de'], [0.5, '#2dd4bf'], [1, '#0f9488']]),
    3.6,
  );

  // Ear tufts.
  fillStroke(ctx, new Path2D('M52,34 L44,12 L72,26 Z'), '#2dd4bf', 3.2);
  fillStroke(ctx, new Path2D('M148,34 L156,12 L128,26 Z'), '#2dd4bf', 3.2);

  // Belly with feather scallops and spots.
  ctx.fillStyle = linear(ctx, 0, 102, 0, 170, [[0, '#ffe9cc'], [1, '#f6c38f']]);
  ctx.fill(new Path2D('M62,116 Q72,106 84,112 Q100,102 116,112 Q128,106 138,116 C146,134 138,164 100,170 C62,164 54,134 62,116 Z'));
  ctx.strokeStyle = '#e8a064';
  ctx.lineWidth = 2.2;
  ctx.stroke(new Path2D('M72,124 Q80,132 88,124 M92,128 Q100,136 108,128 M112,124 Q120,132 128,124'));
  ctx.fillStyle = 'rgba(190, 120, 70, 0.5)';
  for (const [x, y, r] of [[86, 146, -20], [106, 152, 18], [97, 131, 6], [118, 139, 24], [78, 128, -26]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 3.1, 4.6, (r * Math.PI) / 180, 0, Math.PI * 2);
    ctx.fill();
  }

  // Face mask: two discs joined.
  ctx.fillStyle = linear(ctx, 0, 45, 0, 112, [[0, '#ffffff'], [1, '#e3fbf5']]);
  ctx.beginPath();
  ctx.arc(72, 78, 33, 0, Math.PI * 2);
  ctx.arc(128, 78, 33, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(100, 84, 38, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  eye(ctx, 72, 78, pose);
  eye(ctx, 128, 78, pose);

  // Glasses.
  ctx.strokeStyle = '#0b6f66';
  ctx.lineWidth = 2.6;
  for (const cx of [72, 128]) {
    ctx.beginPath();
    ctx.arc(cx, 78, 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(96, 74);
  ctx.quadraticCurveTo(100, 70, 104, 74);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke(new Path2D('M56,64 Q62,57 70,54 M112,64 Q118,57 126,54'));

  // Beak: opens a little while it talks.
  const open = pose.mouth * 4;
  fillStroke(ctx, new Path2D(`M92,92 Q100,87 108,92 Q104,${104 + open} 100,${108 + open} Q96,${104 + open} 92,92 Z`), '#7a5230', 2.8);

  ctx.restore();
}
