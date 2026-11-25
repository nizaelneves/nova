import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DOTS_H, DOTS_W, MARK, SPARKS, drawCheck, drawDust, drawIdle, drawListen, drawSend, drawSparks, drawWave, fibAt } from './voiceDraw';

export type PillMode = 'listen' | 'starting' | 'countdown' | 'send' | 'sent' | 'speak' | 'error';

const LABEL: Record<PillMode, string> = {
  listen: 'Listening',
  starting: 'Starting the microphone',
  countdown: 'Closing soon',
  send: 'Sending',
  sent: 'Sent',
  speak: 'Phibe is speaking',
  error: 'Voice problem',
};

/** A canvas that is sharp on dense screens but never bigger than twice its size. It can come and go: `ref` sets it up whenever it mounts. */
function useCanvas(w: number, h: number) {
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  const ref = useCallback((canvas: HTMLCanvasElement | null) => {
    const c = canvas?.getContext('2d') ?? null;
    ctx.current = c;
    if (!canvas || !c) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, [w, h]);
  return { ref, ctx };
}

/** The Fibonacci number as an odometer: only the digits that change roll up. Five slots, so the pill never changes width. */
function Odometer({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const before = useRef('');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = value.padStart(5, ' ');
    const old = before.current.padStart(5, ' ');
    [...next].forEach((ch, k) => {
      const slot = el.children[k] as HTMLElement;
      const text = ch.trim();
      if (slot.textContent === text) return;
      slot.textContent = text;
      if (old[k] !== ch) slot.animate?.([{ transform: 'translateY(55%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    before.current = value;
  }, [value]);
  return (
    <span className="vp-odo" ref={ref} aria-hidden="true">
      <span /><span /><span /><span /><span />
    </span>
  );
}

/**
 * The voice indicator, small and calm: a matrix of dots that lights up with the voice, and what it says beside it.
 * - listening: the dots follow your voice, with the time
 * - sending: a wave of light and the Fibonacci number rolling up (0 ... 75025, then again)
 * - sent: the dots come apart like dust and a check mark is drawn
 * - speaking (Phibe's own voice): a wave of dots and sparks
 * It appears at its usual place and can be dragged anywhere; double click puts it back. The new place is forgotten
 * when the pill goes away, so the next one is born where it always is.
 */
export function VoicePill({
  mode,
  getLevel,
  countdownSecs = 0,
  message = '',
  action,
}: {
  mode: PillMode;
  /** How loud the voice is right now, 0 to 1 (yours while listening, Phibe's while speaking). */
  getLevel: () => number;
  countdownSecs?: number;
  /** What went wrong (error mode). */
  message?: string;
  /** The one button a problem can offer (for example, open the microphone settings). */
  action?: { label: string; run: () => void };
}) {
  const dots = useCanvas(DOTS_W, DOTS_H);
  const mark = useCanvas(MARK.w, MARK.h);
  const sparks = useCanvas(SPARKS.w, SPARKS.h);
  const [text, setText] = useState('');
  const [fib, setFib] = useState('0');
  const level = useRef(getLevel);
  level.current = getLevel;
  const root = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  // One animation frame at a time, 30 a second, only while the pill is on screen.
  useEffect(() => {
    if (mode === 'error') return;
    const began = performance.now();
    let frame = 0;
    let last = 0;
    let shownText = '';
    let shownFib = '';
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      const t = now / 1000;
      const p = (now - began) / 1000;
      const c = dots.ctx.current;
      if (c) {
        c.clearRect(0, 0, DOTS_W, DOTS_H);
        if (mode === 'listen') drawListen(c, level.current(), t);
        else if (mode === 'countdown') drawListen(c, level.current(), t, 0.5);
        else if (mode === 'starting') drawIdle(c, t);
        else if (mode === 'send') drawSend(c, t);
        else if (mode === 'sent') drawDust(c, p);
        else drawWave(c, level.current(), t);
      }
      const m = mark.ctx.current;
      if (m && mode === 'sent') {
        m.clearRect(0, 0, MARK.w, MARK.h);
        drawCheck(m, p);
      }
      const s = sparks.ctx.current;
      if (s && mode === 'speak') {
        s.clearRect(0, 0, SPARKS.w, SPARKS.h);
        drawSparks(s, t);
      }
      const label = mode === 'listen' ? `${Math.floor(p / 60)}:${String(Math.floor(p % 60)).padStart(2, '0')}` : mode === 'countdown' ? String(Math.max(0, Math.ceil(countdownSecs - p))) : mode === 'starting' ? 'mic' : '';
      if (label !== shownText) { shownText = label; setText(label); }
      if (mode === 'send') {
        const number = String(fibAt(p));
        if (number !== shownFib) { shownFib = number; setFib(number); }
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mode, countdownSecs, dots.ctx, mark.ctx, sparks.ctx]);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = root.current?.getBoundingClientRect();
    if (!grab.current || !box) return;
    setAt({
      x: Math.min(window.innerWidth - box.width, Math.max(0, e.clientX - grab.current.dx)),
      y: Math.min(window.innerHeight - box.height, Math.max(0, e.clientY - grab.current.dy)),
    });
  };

  return (
    <div
      ref={root}
      className="vp"
      data-mode={mode}
      data-moved={at !== null}
      role="status"
      aria-label={LABEL[mode]}
      style={at ? { left: at.x, top: at.y } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => { grab.current = null; }}
      onPointerCancel={() => { grab.current = null; }}
      onDoubleClick={() => setAt(null)}
    >
      {mode === 'error' ? (
        <>
          <span className="vp-bang" aria-hidden="true">!</span>
          <span className="vp-msg">{message || 'Something went wrong.'}</span>
          {action && <button type="button" className="vp-act" onPointerDown={(e) => e.stopPropagation()} onClick={action.run}>{action.label}</button>}
        </>
      ) : (
        <>
          <canvas ref={dots.ref} style={{ width: DOTS_W, height: DOTS_H }} aria-hidden="true" />
          {mode === 'send' && <Odometer value={fib} />}
          {(mode === 'listen' || mode === 'countdown' || mode === 'starting') && <span className="vp-txt">{text}</span>}
          {mode === 'sent' && <canvas ref={mark.ref} style={{ width: MARK.w, height: MARK.h }} aria-hidden="true" />}
          {mode === 'speak' && <canvas ref={sparks.ref} style={{ width: SPARKS.w, height: SPARKS.h }} aria-hidden="true" />}
        </>
      )}
    </div>
  );
}
