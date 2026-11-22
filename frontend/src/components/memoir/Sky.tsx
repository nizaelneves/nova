import { useEffect, useRef } from 'react';

/** The living sky behind Memoir: stars at three depths that drift and twinkle, and a shooting star now and then. */
export function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, g = canvas.getContext('2d')!;
    const fit = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    fit();
    addEventListener('resize', fit);
    const stars = Array.from({ length: 150 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, d: Math.random(), p: Math.random() * 7 }));
    let shoot: { x: number; y: number; l: number } | null = null, next = performance.now() + 3000, raf = 0;
    const frame = (now: number) => {
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.x -= 0.06 + s.d * 0.22; s.y += 0.02 + s.d * 0.06;
        if (s.x < 0) s.x = canvas.width;
        if (s.y > canvas.height) s.y = 0;
        g.globalAlpha = (0.25 + s.d * 0.55) * (0.6 + 0.4 * Math.sin(now / 700 + s.p));
        g.fillStyle = s.d > 0.8 ? '#8fe3ff' : s.d > 0.6 ? '#f0abfc' : '#fff';
        g.beginPath(); g.arc(s.x, s.y, 0.4 + s.d * 1.2, 0, 7); g.fill();
      }
      if (!shoot && now > next) shoot = { x: Math.random() * canvas.width * 0.8 + canvas.width * 0.2, y: Math.random() * canvas.height * 0.4, l: 0 };
      if (shoot) {
        shoot.l += 14;
        const x = shoot.x - shoot.l * 1.4, y = shoot.y + shoot.l * 0.7, grad = g.createLinearGradient(x, y, x + 140, y - 70);
        grad.addColorStop(0, 'rgba(143,227,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,.9)');
        g.globalAlpha = 1; g.strokeStyle = grad; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 140, y - 70); g.stroke();
        if (shoot.l > 120) { shoot = null; next = now + 5000 + Math.random() * 6000; }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); };
  }, []);
  return <canvas ref={ref} className="mm-sky" aria-hidden="true" />;
}
