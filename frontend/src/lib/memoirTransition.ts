import { useSyncExternalStore } from 'react';
import { memoirMark } from './memoirMark';
import { ICONS } from '../icons/solar';

/**
 * The jump into Memoir and back out: a flight through the stars drawn over the whole window.
 * Memoir is a separate space, so the page behind the effect changes while the screen is white.
 */

type Go = (to: string) => void;

let revealed = true;
const listeners = new Set<() => void>();
const setRevealed = (v: boolean) => { revealed = v; listeners.forEach((l) => l()); };
/** False while the jump is still running: Memoir keeps its pieces hidden, then builds them in when this turns true. */
export const useMemoirReveal = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => revealed);

const EASE = 'cubic-bezier(.65,0,.25,1)';
const OUT = 'cubic-bezier(.16,1,.3,1)';
const ramp = (t: number) => t * t * (3 - 2 * t);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const FX = 'memoir.fx';
/** Whether the jump into and out of Memoir plays (the Config screen switches it). */
export const entryAnimation = (): boolean => { try { return localStorage.getItem(FX) !== 'off'; } catch { return true; } };
export const setEntryAnimation = (on: boolean) => { try { localStorage.setItem(FX, on ? 'on' : 'off'); } catch { /* not remembered */ } };
const reduced = () => !entryAnimation() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let busy = false;

const html = (s: string) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild as HTMLElement; };

function overlay() {
  const el = html(`
    <div class="mmfx" aria-hidden="true">
      <div class="mmfx-iris"></div>
      <canvas class="mmfx-stars"></canvas>
      <div class="mmfx-hud"><span>Elevation</span><b class="mmfx-alt">00000</b><span>KM</span><i><u class="mmfx-gauge"></u></i></div>
      <div class="mmfx-flash"></div>
      <div class="mmfx-title"><div>
        <div class="mmfx-mark"><i class="o3"></i><i class="o1"></i><i class="o2"></i>
          <svg viewBox="0 0 24 24">${ICONS.atom}</svg></div>
        <h1 class="mmfx-word">${memoirMark('mk-intro')}</h1>
        <div class="mmfx-tagrow"><i class="l"></i><p></p><i class="r"></i></div>
      </div></div>
    </div>`);
  document.body.appendChild(el);
  const q = <T extends Element>(s: string) => el.querySelector(s) as T;
  return { el, q };
}

interface Star { x: number; y: number; z: number; c: string }
const COLORS = ['#ffffff', '#8fe3ff', '#f0abfc', '#c4b5fd'];

/** Flies through the stars for `ms`. `speed(t)` runs from 0 (drifting) to 1 (hyperspace), t from 0 to 1. */
function fly(canvas: HTMLCanvasElement, ms: number, speed: (t: number) => number, onSpeed?: (s: number, dt: number) => void) {
  const g = canvas.getContext('2d')!;
  canvas.width = innerWidth; canvas.height = innerHeight; canvas.style.opacity = '1';
  const cx = innerWidth / 2, cy = innerHeight / 2, F = Math.min(innerWidth, innerHeight) * 0.45;
  const stars: Star[] = Array.from({ length: 560 }, (_, i) => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), c: COLORS[i % 4] }));
  const rings = Array.from({ length: 12 }, (_, i) => i / 12);
  const t0 = performance.now();
  let last = t0;
  return new Promise<void>((done) => {
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / ms), sp = speed(t), dt = Math.min(50, now - last) / 16.7;
      last = now;
      g.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.transform = sp > 0.7 ? `translate(${(Math.random() - 0.5) * sp * 5}px,${(Math.random() - 0.5) * sp * 5}px)` : '';
      if (sp > 0.2) {
        rings.forEach((z, i) => { // thin hoops of light rushing toward you
          rings[i] = z - (0.004 + sp * 0.03) * dt <= 0.04 ? 1 : z - (0.004 + sp * 0.03) * dt;
          g.globalAlpha = (1 - rings[i]) * 0.35 * Math.min(1, sp * 1.4);
          g.strokeStyle = rings[i] > 0.5 ? '#7c5cff' : '#8fe3ff'; g.lineWidth = 1 + (1 - rings[i]) * 2;
          g.beginPath(); g.arc(cx, cy, (F * 0.32) / rings[i], 0, 7); g.stroke();
        });
      }
      for (const s of stars) {
        const z0 = s.z;
        s.z -= (0.002 + sp * 0.07) * dt;
        if (s.z <= 0.02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; continue; }
        const x0 = cx + (s.x / z0) * F, y0 = cy + (s.y / z0) * F, x1 = cx + (s.x / s.z) * F, y1 = cy + (s.y / s.z) * F;
        const ax = sp > 0.05 ? x0 : x1, ay = sp > 0.05 ? y0 : y1, al = Math.min(1, (1 - s.z) * 1.4), lw = 0.6 + (1 - s.z) * (1.2 + sp * 1.6);
        const line = (dx: number, color: string, alpha: number) => {
          g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = lw;
          g.beginPath(); g.moveTo(ax + dx, ay); g.lineTo(x1 + dx + 0.01, y1); g.stroke();
        };
        if (sp > 0.55) { line(-2.5, '#ff4fd8', al * 0.5); line(2.5, '#22d3ee', al * 0.5); } // colour split at full speed
        line(0, s.c, al);
      }
      onSpeed?.(sp, dt);
      if (t < 1) requestAnimationFrame(frame); else { canvas.style.transform = ''; done(); }
    };
    requestAnimationFrame(frame);
  });
}

async function titleIn(q: <T extends Element>(s: string) => T) {
  const title = q<HTMLElement>('.mmfx-title');
  title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
  q<SVGElement>('.mmfx-mark svg').querySelectorAll('path').forEach((p) => {
    p.setAttribute('pathLength', '1'); p.style.strokeDasharray = '1';
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 500, easing: 'ease-in-out', fill: 'forwards' });
  });
  q('.mmfx-mark').querySelectorAll('i').forEach((el, i) => el.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 450, delay: i * 70, easing: OUT, fill: 'backwards' }));
  q('.mmfx-word svg').querySelectorAll('path').forEach((p, i) => { // the strokes are drawn one after another
    p.setAttribute('pathLength', '1'); p.style.strokeDasharray = '1';
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, delay: 80 + i * 60, easing: OUT, fill: 'backwards' });
  });
  q('.mmfx-word svg').querySelectorAll('circle').forEach((c, i) => c.animate([{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 400, delay: 400 + i * 60, easing: OUT, fill: 'backwards' }));
  q('.mmfx-tagrow').querySelectorAll('i').forEach((el) => el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 450, delay: 400, easing: OUT, fill: 'forwards' }));
  await wait(600);
  const tag = q<HTMLElement>('.mmfx-tagrow p');
  tag.classList.add('typing');
  for (const ch of 'Beyond What You Know') { tag.textContent += ch; await wait(22); }
  await wait(80);
  tag.classList.remove('typing');
}

/** Memoir's jump in: the window falls away, a flight through the stars, a white-out, then the name and the line. About 3.2 seconds. */
export async function enterMemoir(go: Go) {
  if (busy) return;
  if (reduced()) { go('/notes'); return; }
  busy = true;
  const { el, q } = overlay(), root = document.getElementById('root');
  const canvas = q<HTMLCanvasElement>('.mmfx-stars'), flash = q<HTMLElement>('.mmfx-flash'), hud = q<HTMLElement>('.mmfx-hud');
  const alt = q<HTMLElement>('.mmfx-alt'), gauge = q<HTMLElement>('.mmfx-gauge');
  let km = 0;
  try {
    root?.animate([{ transform: 'scale(1)', filter: 'blur(0)', opacity: 1 }, { transform: 'scale(.76)', filter: 'blur(12px)', opacity: 0 }], { duration: 650, easing: EASE, fill: 'forwards' });
    hud.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 150, fill: 'forwards' });
    const flight = fly(canvas, 1500, (t) => (t < 0.55 ? ramp(t / 0.55) : 1), (sp, dt) => {
      km += (sp * sp * 260 + 1) * dt; alt.textContent = String(Math.floor(km)).padStart(5, '0'); gauge.style.width = `${sp * 100}%`;
    });
    await wait(1200);
    flash.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    hud.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    await wait(200);
    setRevealed(false); // Memoir mounts now, hidden behind the white-out
    go('/notes');
    root?.getAnimations().forEach((a) => a.cancel());
    q<HTMLElement>('.mmfx-iris').style.clipPath = 'circle(150% at 50% 50%)';
    flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });
    const shown = titleIn(q);
    await flight;
    const drift = fly(canvas, 2000, (t) => 1 - ramp(Math.min(1, t * 1.4)) * 0.97);
    await shown; await wait(450);
    q<HTMLElement>('.mmfx-title').animate([{ opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(1.08)', filter: 'blur(10px)' }], { duration: 400, easing: 'ease', fill: 'forwards' });
    await wait(180);
    setRevealed(true); // Memoir builds itself in while the stars slow to a stop
    q<HTMLElement>('.mmfx-iris').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 60, fill: 'forwards' });
    await drift;
    canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' });
    await wait(100);
  } finally {
    setRevealed(true); root?.getAnimations().forEach((a) => a.cancel()); el.remove(); busy = false;
  }
}

/** The way back to the rest of Phibe: Memoir dissolves, a short flight, and the window returns. About 1 second. */
export async function leaveMemoir(go: Go) {
  if (busy) return;
  if (reduced()) { go('/'); return; }
  busy = true;
  const { el, q } = overlay(), root = document.getElementById('root');
  const canvas = q<HTMLCanvasElement>('.mmfx-stars'), flash = q<HTMLElement>('.mmfx-flash');
  try {
    root?.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.05)' }], { duration: 300, easing: EASE, fill: 'forwards' });
    const back = fly(canvas, 800, (t) => (t < 0.5 ? ramp(t / 0.5) : 1 - ramp((t - 0.5) / 0.5)));
    await wait(380);
    flash.animate([{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }], { duration: 330, easing: 'ease', fill: 'forwards' });
    await wait(120);
    root?.getAnimations().forEach((a) => a.cancel());
    go('/');
    root?.animate([{ opacity: 0, transform: 'scale(1.15)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 400, easing: EASE });
    await back;
  } finally {
    root?.getAnimations().forEach((a) => a.cancel()); el.remove(); busy = false;
  }
}
