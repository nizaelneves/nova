import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Icon } from './Icon';
import { BadgeGlyph } from './BadgeIcon';
import { AvatarMini } from './AvatarMini';
import { VoiceBadgeSvg, useCountdown, useVoiceEvents } from '../voice/VoiceCard';
import { cardView } from '../voice/voiceCardModel';
import { isTauri } from '../lib/api';
import '../voice/voice.css';
import { approveAction, denyAction, fetchPendingApprovals } from '../lib/api';
import type { PendingApproval } from '../lib/api';
import { useAppStore } from '../lib/store';
import {
  BUTTON_SIZE,
  DOCK_AFTER_MS,
  loadPlacement,
  placementFromDrop,
  placementToTopLeft,
  popoverSide,
  savePlacement,
  topBadge,
  type BadgeKind,
  type Placement,
} from '../lib/phibeBubble';
import { dismissPhibeEvent, usePhibeEvents } from '../lib/phibePresence';

const BADGE_COLOR: Record<BadgeKind, string> = {
  approval: '#f59e0b',
  question: '#38bdf8',
  error: '#ef4444',
  draft: '#a78bfa',
  done: '#22c55e',
  ping: '#2dd4bf',
};

const BADGE_LABEL: Record<BadgeKind, string> = {
  approval: 'waiting for your approval',
  question: 'has a question',
  error: 'hit a problem',
  draft: 'has a voice draft for you',
  done: 'finished something',
  ping: 'has a reminder',
};

const DRAG_THRESHOLD = 6;
const POPOVER_WIDTH = 320;
const POLL_MS = 15000;

function Badge({ kind, total }: { kind: BadgeKind; total: number }) {
  return (
    <span key={`${kind}-${total}`} className="phibe-badge" aria-hidden="true">
      <svg width="26" height="26" viewBox="-13 -13 26 26">
        <circle cx="0" cy="0" r="11" fill={BADGE_COLOR[kind]} stroke="var(--color-bg)" strokeWidth="2.5" />
        <BadgeGlyph kind={kind} />
      </svg>
      {total > 1 && <span className="phibe-badge-count">{total > 9 ? '9+' : total}</span>}
    </span>
  );
}

function usePendingApprovals(enabled: boolean) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const load = useCallback(() => {
    fetchPendingApprovals().then(setApprovals).catch(() => {});
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    // Quiet by design: one light request now and then, and none while the tab is hidden.
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, load]);
  return { approvals, setApprovals, reload: load };
}

/**
 * Phibe's floating button: always within reach, never in the way. It rests on a side
 * edge, can be dragged anywhere (it snaps back to the nearest edge), tucks half out of
 * sight when idle, and wears a small badge when something needs you. Click it to open
 * the chat bubble with what is waiting.
 */
export function PhibeBubble() {
  const enabled = useAppStore((s) => s.settings.floatingPhibe);
  const avatarId = useAppStore((s) => s.settings.avatar);
  const effects = useAppStore((s) => s.settings.effects);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const navigate = useNavigate();

  const [placement, setPlacement] = useState<Placement>(loadPlacement);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [docked, setDocked] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const drag = useRef<{ offX: number; offY: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // While the voice shortcut is in use the button itself shows it: a ring and a badge.
  const { state: voiceState } = useVoiceEvents();
  const voice = cardView(voiceState, useCountdown(voiceState));
  const voiceOn = enabled && voiceState.phase !== 'idle';

  // Tell the desktop app whether the button is on and where it sits, so outside Phibe it can
  // show a button in the same place.
  useEffect(() => {
    if (!isTauri()) return;
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('voice_set_floating', { on: enabled, right: placement.edge === 'right', y: placement.y }),
    );
  }, [enabled, placement]);

  const events = usePhibeEvents();
  const { approvals, setApprovals, reload } = usePendingApprovals(enabled);

  const counts = useMemo(() => {
    const c: Partial<Record<BadgeKind, number>> = { approval: approvals.length };
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [approvals.length, events]);
  const badge = topBadge(counts);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Tuck away after a quiet moment, unless something is waiting or the bubble is open.
  useEffect(() => {
    if (!enabled || open || dragPos || badge || voiceOn) {
      setDocked(false);
      return;
    }
    const id = window.setTimeout(() => setDocked(true), DOCK_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [enabled, open, dragPos, badge, voiceOn, placement]);

  // Close with Escape or a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const decide = async (id: string, action: 'approve' | 'deny') => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await (action === 'approve' ? approveAction(id) : denyAction(id));
      setApprovals((prev) => prev.filter((a) => a.id !== id));
      toast.success(action === 'approve' ? 'Approved' : 'Denied');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your answer');
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  if (!enabled) return null;

  const rest = placementToTopLeft(placement, viewport.w, viewport.h, docked);
  const pos = dragPos ? { x: dragPos.x, y: dragPos.y } : { x: rest.left, y: rest.top };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
      d.moved = true;
      setOpen(false);
    }
    if (d.moved) {
      const x = Math.min(viewport.w - BUTTON_SIZE, Math.max(0, e.clientX - d.offX));
      const y = Math.min(viewport.h - BUTTON_SIZE, Math.max(0, e.clientY - d.offY));
      setDragPos({ x, y });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved || !dragPos) return;
    suppressClick.current = true;
    const next = placementFromDrop(dragPos.x + BUTTON_SIZE / 2, dragPos.y + BUTTON_SIZE / 2, viewport.w, viewport.h);
    setPlacement(next);
    savePlacement(next);
    setDragPos(null);
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setOpen((v) => !v);
  };

  const side = popoverSide(placement);
  const popLeft = Math.min(
    Math.max(8, side.horizontal === 'right' ? rest.left + BUTTON_SIZE - POPOVER_WIDTH : rest.left),
    viewport.w - POPOVER_WIDTH - 8,
  );
  const popStyle: React.CSSProperties =
    side.vertical === 'above'
      ? { left: popLeft, bottom: viewport.h - rest.top + 12 }
      : { left: popLeft, top: rest.top + BUTTON_SIZE + 12 };

  const waiting = approvals.length + events.length;
  const label = badge ? `Phibe, ${BADGE_LABEL[badge.kind]}${badge.total > 1 ? `, ${badge.total} things` : ''}` : 'Phibe';

  return (
    <div ref={rootRef}>
      <button
        type="button"
        className="phibe-fab"
        data-docked={docked && !dragPos}
        data-ring={voiceOn ? voice.ring : undefined}
        data-dragging={dragPos !== null}
        aria-label={label}
        aria-expanded={open}
        title={label}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: BUTTON_SIZE, height: BUTTON_SIZE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={() => setDocked(false)}
        onFocus={() => setDocked(false)}
        onClick={onClick}
      >
        <AvatarMini size={BUTTON_SIZE - 6} asleep={docked && !dragPos} still={effects === 'off'} avatar={avatarId} mirror={placement.edge === 'left'} />
        {voiceOn && voice.badge ? <VoiceBadgeSvg badge={voice.badge} /> : badge && <Badge kind={badge.kind} total={badge.total} />}
      </button>

      {open && (
        <div role="dialog" aria-label="Phibe" className="phibe-pop" style={{ width: POPOVER_WIDTH, ...popStyle }}>
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <AvatarMini size={36} still={effects === 'off'} avatar={avatarId} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--color-heading)' }}>Phibe</div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {waiting === 0 ? 'All quiet' : `${waiting} ${waiting === 1 ? 'thing is' : 'things are'} waiting`}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="p-1 rounded cursor-pointer"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <Icon name="close-circle" size={18} />
            </button>
          </div>

          <div className="px-3 py-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 320 }}>
            {waiting === 0 && (
              <p className="text-xs px-1 py-3 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                Nothing needs you right now.
                <br />
                Haste is the enemy of perfection.
              </p>
            )}

            {approvals.map((a) => (
              <div key={a.id} className="rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-start gap-2">
                  <span className="phibe-chip" style={{ background: BADGE_COLOR.approval }}>!</span>
                  <p className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>{a.description}</p>
                </div>
                <div className="flex gap-2 mt-2 justify-end">
                  <button type="button" disabled={busy[a.id]} onClick={() => void decide(a.id, 'deny')} className="phibe-pop-btn">Deny</button>
                  <button type="button" disabled={busy[a.id]} onClick={() => void decide(a.id, 'approve')} className="phibe-pop-btn" data-primary="true">Approve</button>
                </div>
              </div>
            ))}

            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <span className="phibe-chip" style={{ background: BADGE_COLOR[e.kind] }}>
                  <svg width="14" height="14" viewBox="-7 -7 14 14"><g transform="scale(.55)"><BadgeGlyph kind={e.kind} /></g></svg>
                </span>
                <p className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>{e.text}</p>
                <button type="button" aria-label="Dismiss" onClick={() => dismissPhibeEvent(e.id)} className="p-0.5 cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                  <Icon name="close-circle" size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button type="button" className="phibe-pop-btn flex-1" data-primary="true" onClick={() => { setOpen(false); navigate('/'); }}>
              Open chat
            </button>
            {approvals.length > 0 && (
              <button type="button" className="phibe-pop-btn" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('phibe:island', { detail: 'approvals' })); }}>
                Approvals
              </button>
            )}
            <button
              type="button"
              className="phibe-pop-btn"
              title="Hide Phibe (turn her back on in Settings)"
              onClick={() => {
                setOpen(false);
                updateSettings({ floatingPhibe: false });
                toast('Phibe is hidden. Turn her back on in Settings.');
              }}
            >
              Hide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
