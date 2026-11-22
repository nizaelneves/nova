import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { fetchPendingApprovals } from '../lib/api';
import type { PendingApproval } from '../lib/api';
import { IslandPanel, type IslandLevel, type IslandSection } from './IslandPanel';
import { useAppStore } from '../lib/store';
import { getVoiceLevel } from '../lib/voiceReply';
import { gazeToward } from '../lib/avatar/gaze';
import { PhibeNebula, nebulaSize, type NebulaMood } from './PhibeNebula';
import { useVoiceEvents } from '../voice/VoiceCard';

type IslandState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'waiting';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Phibe's island: the Orb's face in a small black pill attached to the top edge of the app,
 * centred. It lives inside the Phibe window only. The eyes follow the
 * cursor right away (no animation delay, only a light smoothing over a couple of frames), and the
 * pill widens to say what Phibe is doing.
 */
export function Island() {
  const effects = useAppStore((s) => s.settings.effects);
  const speaking = useAppStore((s) => s.speaking);
  const thinking = useAppStore((s) => s.streamState.isStreaming);
  const { state: voice } = useVoiceEvents();
  const [happy, setHappy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [burst, setBurst] = useState(0); // a burst of stars when you move to another screen
  const firstScreen = useRef(true);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [open, setOpen] = useState(false); // the panel with the sections
  const [section, setSection] = useState<IslandSection>('chats');
  const [hover, setHover] = useState(false);
  const [extra, setExtra] = useState(0); // height added while the message box grows
  const waiting = pending.length;
  const level: IslandLevel = open ? 'panel' : hover && waiting > 0 ? 'card' : 'pill';
  const { pathname } = useLocation();

  // Every time the island opens it opens on the chat (unless something asked for another section).
  useEffect(() => { if (!open) setSection('chats'); }, [open]);

  const faceRef = useRef<HTMLDivElement>(null);
  // Where the eyes look, -1 to 1; the Orb reads it on every frame.
  const gaze = useRef<[number, number]>([0, 0]);
  const lastMove = useRef(0);

  const listening = voice.phase === 'listening' || voice.phase === 'countdown';
  const state: IslandState = happy ? 'done' : listening ? 'listening' : speaking ? 'speaking' : thinking ? 'thinking' : waiting > 0 ? 'waiting' : 'idle';

  // The eyes follow the cursor over the whole window; when it rests, they glance around.
  useEffect(() => {
    if (effects === 'off') return;
    const onMove = (e: PointerEvent) => {
      const r = faceRef.current?.getBoundingClientRect();
      if (!r) return;
      gaze.current = gazeToward(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      lastMove.current = performance.now();
    };
    const onLeave = () => {
      gaze.current = [0, 0.2];
    };
    const wander = window.setInterval(() => {
      if (performance.now() - lastMove.current > 3000) {
        gaze.current = [[-1, -0.4, 0.6, 1][Math.floor(Math.random() * 4)] * 0.8, rand(-0.3, 0.3)];
      }
    }, 3200);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.clearInterval(wander);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [effects]);

  // A small pulse whenever you move to another screen.
  // The Orb also bursts into stars (not on the first screen).
  useEffect(() => {
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 377);
    if (!firstScreen.current && effects !== 'off') setBurst((n) => n + 1);
    firstScreen.current = false;
    return () => window.clearTimeout(t);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Approvals waiting for you: checked now and then, only while the window is visible.
  useEffect(() => {
    const check = () => {
      if (!document.hidden) fetchPendingApprovals().then(setPending).catch(() => setPending([]));
    };
    check();
    const id = window.setInterval(check, 15000);
    return () => window.clearInterval(id);
  }, [pathname]);

  // Ctrl+W (Cmd+W on Mac) opens and closes the panel; Escape closes it. Browsers keep Ctrl+W for
  // closing the tab, so in the browser this only works inside the desktop app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setOpen(false); // a pop-up takes the Escape first
    };
    // Other parts of the app can open the panel on a section (the floating button does, for approvals).
    const onOpen = (e: Event) => {
      setSection((e as CustomEvent<IslandSection>).detail ?? 'chats');
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('phibe:island', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('phibe:island', onOpen);
    };
  }, []);

  // The mist stops when the window is hidden or not focused.
  useEffect(() => {
    const apply = () => setHidden(document.hidden || !document.hasFocus());
    apply();
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('focus', apply);
    window.addEventListener('blur', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      window.removeEventListener('focus', apply);
      window.removeEventListener('blur', apply);
    };
  }, []);

  const text = state === 'waiting' ? `${waiting} to approve` : ''; // the only words left: approvals that wait for you
  const wide = text !== '';
  const mood: NebulaMood = state === 'done' ? 'happy' : state === 'waiting' ? 'idle' : state;
  const orb = nebulaSize(0.39);
  const still = effects === 'off' || hidden;
  return (
    <div
      className={`phibe-island${still ? ' is-still' : ''}`}
      data-pulse={pulse}
      data-state={state}
      data-level={level}
      style={{ ['--isl-extra' as string]: `${extra}px`, width: level === 'panel' ? 'min(610px, calc(100vw - 32px))' : level === 'card' ? 'min(400px, calc(100vw - 32px))' : wide ? 300 : 216 }}
      onClick={() => setOpen((v) => !v)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="img"
      aria-label={wide ? `Phibe: ${text}` : 'Phibe'}
    >
      <div className="phibe-island-inner">
        <div className="phibe-island-facebox" ref={faceRef}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -orb.width / 2, marginTop: -orb.height / 2, pointerEvents: 'none' }}>
            <PhibeNebula mood={mood} palette="mint" scale={0.36} id="isl" gaze={gaze} getLevel={getVoiceLevel} burstKey={burst} still={still} />
          </div>
        </div>
        <span className="phibe-island-label" aria-hidden="true" style={{ opacity: wide ? 1 : 0, width: wide ? 'auto' : 0 }}>
          {text}
        </span>
      </div>
      <IslandPanel onExtra={setExtra} level={level} section={section} onSection={setSection} pending={pending} onClose={() => setOpen(false)}
        onDecided={() => { setHappy(true); window.setTimeout(() => setHappy(false), 3300); fetchPendingApprovals().then(setPending).catch(() => setPending([])); }} />
    </div>
  );
}
