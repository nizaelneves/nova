import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BadgeGlyph } from '../components/BadgeIcon';
import { AvatarMini } from '../components/AvatarMini';
import { barHeights } from '../lib/voiceBars';
import { isTauri } from '../lib/api';
import { INITIAL_VOICE_STATE, cardView, fibWindow, formatElapsed, keyParts, type CardBadge, type VoiceState } from './voiceCardModel';

const BARS = 40;
const BAR_WIDTH = 4.6;
const GAP = 3.2;
const WIDTH = BARS * (BAR_WIDTH + GAP) - GAP;
const HEIGHT = 44;

/**
 * Listens to the two events the desktop app sends while recording (`voice:state` and
 * `voice:level`). Used by the card window and by the card shown inside the app.
 */
export function useVoiceEvents(): { state: VoiceState; levelRef: MutableRefObject<number> } {
  const [state, setState] = useState<VoiceState>(INITIAL_VOICE_STATE);
  const levelRef = useRef(0);
  useEffect(() => {
    if (!isTauri()) return;
    const unlistenState = listen<VoiceState>('voice:state', (e) => {
      if (e.payload.phase !== 'idle') window.dispatchEvent(new Event('phibe:activity')); // a voice recording is somebody being there
      if (e.payload.phase !== 'listening' && e.payload.phase !== 'countdown') levelRef.current = 0;
      setState(e.payload);
    });
    const unlistenLevel = listen<{ level: number }>('voice:level', (e) => {
      levelRef.current = e.payload.level;
    });
    return () => {
      void unlistenState.then((f) => f());
      void unlistenLevel.then((f) => f());
    };
  }, []);
  return { state, levelRef };
}

/** The badge on the avatar (the small round symbol), as drawn in voice-badges.svg. */
export function VoiceBadgeSvg({ badge }: { badge: CardBadge }) {
  return (
    <svg className="vc-badge" width="36" height="36" viewBox="-18 -18 36 36" aria-hidden="true">
      <circle r="15" fill={badge.color} stroke="#070b10" strokeWidth="3" />
      {badge.label ? (
        <text x="0" y="1" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle" dominantBaseline="central" fontFamily="ui-monospace, Consolas, monospace">
          {badge.label}
        </text>
      ) : (
        badge.glyph && <BadgeGlyph kind={badge.glyph} />
      )}
    </svg>
  );
}

/** Whole seconds left of the countdown, ticking while it runs (for the badge on the button). */
export function useCountdown(state: VoiceState): number | undefined {
  const [left, setLeft] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    const end = performance.now() + (state.countdown_secs ?? 0) * 1000;
    const tick = () => setLeft((end - performance.now()) / 1000);
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state.phase, state.countdown_secs]);
  return state.phase === 'countdown' ? left : undefined;
}

/** While a message goes to Phibe, the Fibonacci numbers keep coming, one after another, until it is sent. */
function FibTicker() {
  const [tick, setTick] = useState(4);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t >= 34 ? 4 : t + 1)), 320);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="vc-fib" aria-hidden="true">
      {fibWindow(tick, 6).map((n, i, all) => (
        <span key={`${tick - all.length + i}`} data-new={i === all.length - 1} style={{ opacity: 0.25 + (0.75 * (i + 1)) / all.length }}>
          {n}
        </span>
      ))}
    </div>
  );
}

/**
 * Version A of the voice indicator: a small card with the voice bars, a timer and the
 * key hint. With `avatar` it also shows the avatar below it wearing a ring and a badge;
 * that part is only for the floating window used outside the app. Inside the app only
 * the card appears.
 */
export function VoiceCardView({
  state,
  levelRef,
  avatar,
  cardless = false,
  mirror = false,
  onAction,
}: {
  state: VoiceState;
  levelRef: MutableRefObject<number>;
  avatar: boolean;
  /** Only the button with its ring and badge, no card (the floating button is on). */
  cardless?: boolean;
  /** The button is on the left edge: the avatar turns to face the middle. */
  mirror?: boolean;
  onAction?: (id: string) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | undefined>(undefined);
  const stateRef = useRef(state);
  stateRef.current = state;
  const startedAt = useRef(0);
  const countdownAt = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const before = useRef(state.phase);

  // Remember when listening and the countdown began, to run the timer and the count.
  if (before.current !== state.phase) {
    if (state.phase === 'listening' && before.current === 'idle') startedAt.current = performance.now();
    if (state.phase === 'countdown' && before.current !== 'countdown') countdownAt.current = performance.now();
    before.current = state.phase;
  }

  const view = cardView(state, secondsLeft);
  const showing = state.phase !== 'idle';

  // The bars, the timer and the countdown only run while the card is up, then everything stops.
  useEffect(() => {
    if (!showing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas && ctx) {
      canvas.width = WIDTH * ratio;
      canvas.height = HEIGHT * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    let frame = 0;
    let level = 0;
    let last = 0;
    const origin = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;
      const phase = stateRef.current.phase;
      if (ctx && canvas) {
        const live = (phase === 'listening' || phase === 'countdown') && stateRef.current.ready;
        const target = live ? levelRef.current : 0;
        level += (target - level) * (target > level ? 0.5 : 0.15);
        const heights = barHeights(BARS, level, (now - origin) / 1000);
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        const fill = ctx.createLinearGradient(0, 0, WIDTH, 0);
        fill.addColorStop(0, '#10c3d3');
        fill.addColorStop(1, '#20e7aa');
        ctx.fillStyle = fill;
        heights.forEach((h, i) => {
          const barHeight = Math.max(3, h * HEIGHT);
          ctx.beginPath();
          ctx.roundRect(i * (BAR_WIDTH + GAP), (HEIGHT - barHeight) / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
          ctx.fill();
        });
      }
      if (phase === 'listening' || phase === 'countdown') setElapsed(now - startedAt.current);
      if (phase === 'countdown') setSecondsLeft((stateRef.current.countdown_secs ?? 0) - (now - countdownAt.current) / 1000);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [showing, view.live, view.detail, levelRef]);

  if (!showing) return null;

  return (
    <div className="vc-wrap" data-tone={view.tone} data-avatar={avatar} data-cardless={cardless}>
      {!cardless && (
      <div className="vc-card">
        <div className="vc-head">
          {view.recording && <span className="vc-dot" aria-hidden="true" />}
          <span className="vc-title">{view.title}</span>
          {view.timer && <span className="vc-timer">{formatElapsed(elapsed)}</span>}
        </div>
        {(view.live || !view.detail) && <canvas ref={canvasRef} style={{ width: WIDTH, height: HEIGHT }} aria-hidden="true" />}
        {view.detail && <p className="vc-detail">{view.detail}</p>}
        {view.numbers && <FibTicker />}
        {view.action && (
          <button type="button" className="vc-action" onClick={() => onAction?.(view.action!.id)}>
            {view.action.label}
          </button>
        )}
        {view.hint && (
          <div className="vc-hint">
            {keyParts(state.shortcut).map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            <span>send</span>
            <span className="vc-sep">·</span>
            <kbd>Esc</kbd>
            <span>cancel</span>
          </div>
        )}
      </div>
      )}
      {avatar && (
        <div className="vc-fab" data-ring={view.ring}>
          <AvatarMini size={56} />
          {view.badge && <VoiceBadgeSvg badge={view.badge} />}
        </div>
      )}
    </div>
  );
}

/** The floating card window (outside the app): the card and the avatar. */
export function VoiceCard() {
  const { state, levelRef } = useVoiceEvents();
  // The floating button on: only the button (ring and badge). Off: only the card.
  const floating = state.floating === true;
  return <VoiceCardView state={state} levelRef={levelRef} avatar={floating} cardless={floating} mirror={state.float_right === false} onAction={(action) => void invoke('voice_action', { action })} />;
}
