import { useEffect, useRef, useState } from 'react';

const LINES = [
  'Gathering Word', 'Finding Threads', 'Shaping Ideas', 'Connecting Dots',
  'Pulling Out Key Points', 'Weaving Together', 'Polishing Edges', 'Almost There',
];
const W = 320, H = 210;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const LENS = [8, 14, 13, 12, 14, 12, 11, 9]; // 93 dots: the lines of a note
const ACTS = [['chaos', 3.4], ['toNote', 2.2], ['note', 1.4], ['toVortex', 1.6], ['vortex', 2.4], ['toChaos', 1.8]] as const;
const TOTAL = ACTS.reduce((a, b) => a + b[1], 0);
type P = [number, number];
export type Palette = 'memoir' | 'phibe';
/** Memoir's hues run from cyan (190) to violet (315); in Phibe's palette the same run goes from green (150) to teal (190). */
export const phibeTone = (h: number) => 150 + ((h - 190) / 125) * 40;
const mix = (a: P, b: P, w: number): P => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];

/**
 * The waiting screen's picture, in loops: dots drift with a magnet pulling them in and out and leave comet trails, line up
 * as the lines of a note, swirl into a vortex, and scatter again.
 */
function Chaos({ palette }: { palette: Palette }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, g = cv?.getContext('2d');
    if (!cv || !g) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; g.scale(dpr, dpr);
    const CX = W / 2, CY = H / 2;
    const note: P[] = []; LENS.forEach((n, r) => { for (let c = 0; c < n; c++) note.push([CX - 94 + c * 14.5, 22 + r * 23]); });
    const gold = 2.399963;
    const dots = note.map((_, i) => ({ i, x: rand(8, W - 8), y: rand(8, H - 8), ph: rand(0, 6), sr0: (i * 37.3) % 92, sa: i * gold }));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = performance.now(), t = still ? 6.4 : 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!still) t += dt;
      let k = t % TOTAL, act = 0;
      while (k > ACTS[act][1]) { k -= ACTS[act][1]; act += 1; }
      const name = ACTS[act][0], u = ease(clamp(k / ACTS[act][1]));
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 0, W, H); // the fade is what leaves the trails
      g.globalCompositeOperation = 'source-over';
      const spin = t * 0.9;
      for (const d of dots) {
        const dx = d.x - CX, dy = d.y - CY, dist = Math.hypot(dx, dy) || 1, pull = Math.sin(dist * 0.04 - t * 4) * 12; // the magnet, in and out
        const chaos: P = [d.x + Math.sin(t + d.ph) * 11 - (dx / dist) * pull, d.y + Math.cos(t * 0.8 + d.ph) * 11 - (dy / dist) * pull];
        const rr = 8 + ((((d.sr0 - t * 24) % 92) + 92) % 92), ang = d.sa + spin * (3.4 - rr / 34);
        const vortex: P = [CX + Math.cos(ang) * rr, CY + Math.sin(ang) * rr * 0.8];
        const NT = note[d.i];
        let p: P, hue = 195, speed = 0, size = 1.7;
        if (name === 'chaos') { p = chaos; }
        else if (name === 'toNote') { p = mix(chaos, NT, u); hue = 195 + u * 70; speed = Math.sin(u * Math.PI); }
        else if (name === 'note') { p = NT; hue = 265; size = 2; }
        else if (name === 'toVortex') { p = mix(NT, vortex, u); hue = 265 + u * 50; speed = Math.sin(u * Math.PI); }
        else if (name === 'vortex') { p = vortex; hue = 315 - (rr / 100) * 120; size = 1.3 + (1 - rr / 100) * 1.6; speed = (1 - rr / 100) * 0.6; }
        else { p = mix(vortex, chaos, u); hue = 195 + (1 - u) * 120; speed = Math.sin(u * Math.PI); }
        g.fillStyle = `hsla(${palette === 'phibe' ? phibeTone(hue) : hue},90%,${64 + speed * 10}%,${0.5 + speed * 0.4})`;
        g.beginPath(); g.arc(p[0], p[1], size + speed, 0, 7); g.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [palette]);
  return <canvas ref={ref} className="mm-forge-orb" style={{ width: W, height: H }} aria-hidden="true" />;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The waiting screen: the dots, a line that keeps changing, and a quiet timer of how long it has taken. */
export function Forge({ palette = 'memoir' }: { palette?: Palette }) {
  const [n, setN] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const line = window.setInterval(() => setN((v) => (v + 1) % LINES.length), 2600);
    const tick = window.setInterval(() => setSecs((v) => v + 1), 1000);
    return () => { clearInterval(line); clearInterval(tick); };
  }, []);
  return (
    <div className="mm-vc mm-shaping" role="status">
      <Chaos palette={palette} />
      <p key={n} className="mm-forge-line">{LINES[n]}…</p>
      <small className="mm-forge-time">{clock(secs)}</small>
    </div>
  );
}
