import { useEffect, useRef, useState } from 'react';

const LINES = [
  'Gathering Word', 'Finding Threads', 'Shaping Ideas', 'Connecting Dots',
  'Pulling Out Key Points', 'Weaving Together', 'Polishing Edges', 'Almost There',
];
const SIZE = 210;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A small galaxy of dark matter and stardust, in Phibe's colours but without its face. It spins, breathes and sends out waves, in turns. */
function Orb() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = SIZE * dpr;
    g.scale(dpr, dpr);
    const C = SIZE / 2;
    const stars = Array.from({ length: 260 }, (_, i) => {
      const r = 12 + Math.pow(Math.random(), 1.6) * 84, arm = i % 3;
      const hue = r < 30 ? [200, 90, 82] : r < 60 ? [265, 85, 72] : [305, 80, 70]; // cyan-white inside, violet, then magenta outside
      return { r, a: (arm * Math.PI * 2) / 3 + r * 0.05 + rand(-0.5, 0.5), w: 1.3 / (r * 0.05 + 1), s: rand(0.5, 1.9), h: hue, p: rand(0, 6), tilt: rand(0.82, 1) };
    });
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = performance.now(), t = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const phase = Math.floor(t / 5) % 3, k = (t % 5) / 5; // swirl, breathe, wave
      const breathe = phase === 1 ? 0.86 + Math.sin(k * Math.PI * 2) * 0.16 : 1;
      const spin = phase === 0 ? 1 : phase === 1 ? 1.5 : 0.8;
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, SIZE, SIZE);
      g.globalCompositeOperation = 'lighter';
      // haze: three soft clouds that drift round the middle
      ([['124,92,255', 0], ['232,121,249', 2.1], ['60,160,255', 4.2]] as const).forEach(([rgb, off]) => {
        const x = C + Math.cos(t * 0.5 + off) * 22, y = C + Math.sin(t * 0.42 + off) * 18;
        const h = g.createRadialGradient(x, y, 0, x, y, 62 * breathe); h.addColorStop(0, `rgba(${rgb},.03)`); h.addColorStop(0.5, `rgba(${rgb},.17)`); h.addColorStop(1, `rgba(${rgb},0)`); // a ring of haze: the middle stays dark
        g.fillStyle = h; g.beginPath(); g.arc(x, y, 62 * breathe, 0, 7); g.fill();
      });
      // the dark middle with a faint glowing edge
      const ring = g.createRadialGradient(C, C, 6, C, C, 30 * breathe);
      ring.addColorStop(0, 'rgba(143,227,255,0)'); ring.addColorStop(0.7, `rgba(167,139,250,${0.18 + Math.sin(t * 3) * 0.06})`); ring.addColorStop(1, 'rgba(167,139,250,0)');
      g.fillStyle = ring; g.beginPath(); g.arc(C, C, 30 * breathe, 0, 7); g.fill();
      const waveR = phase === 2 ? k * 96 : -1;
      for (const s of stars) {
        s.a += s.w * dt * spin;
        const r = s.r * breathe, x = C + Math.cos(s.a) * r, y = C + Math.sin(s.a) * r * s.tilt;
        const lit = waveR > 0 ? Math.max(0, 1 - Math.abs(r - waveR) / 9) : 0; // a wave passing makes stars flare
        g.fillStyle = `hsla(${s.h[0]},${s.h[1]}%,${s.h[2] + lit * 20}%,${Math.min(1, 0.35 + 0.35 * Math.sin(t * 2.2 + s.p) + lit)})`;
        g.beginPath(); g.arc(x, y, s.s + lit * 1.4, 0, 7); g.fill();
      }
      if (!shoot && Math.random() < dt * 0.35) { const a = rand(0, 6.28); shoot = { x: C + Math.cos(a) * 100, y: C + Math.sin(a) * 100, vx: -Math.cos(a) * 150, vy: -Math.sin(a) * 150 + rand(-40, 40), life: 1 }; }
      if (shoot) {
        shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life -= dt * 1.2;
        g.strokeStyle = `rgba(220,245,255,${Math.max(0, shoot.life)})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(shoot.x, shoot.y); g.lineTo(shoot.x - shoot.vx * 0.09, shoot.y - shoot.vy * 0.09); g.stroke();
        if (shoot.life <= 0) shoot = null;
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="mm-forge-orb" style={{ width: SIZE, height: SIZE }} aria-hidden="true" />;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The waiting screen: the orb, a line that keeps changing, and a quiet timer of how long it has taken. */
export function Forge() {
  const [n, setN] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const line = window.setInterval(() => setN((v) => (v + 1) % LINES.length), 2600);
    const tick = window.setInterval(() => setSecs((v) => v + 1), 1000);
    return () => { clearInterval(line); clearInterval(tick); };
  }, []);
  return (
    <div className="mm-vc mm-shaping" role="status">
      <Orb />
      <p key={n} className="mm-forge-line">{LINES[n]}…</p>
      <small className="mm-forge-time">{clock(secs)}</small>
    </div>
  );
}
