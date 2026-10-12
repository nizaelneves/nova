/**
 * Logic of Phibe's floating button: where it sits, how it snaps to a screen edge,
 * when it tucks itself away and which badge it wears. No DOM in here, so it
 * stays easy to test; the component only reads these results and paints.
 */

export type Edge = 'left' | 'right';

/** The button always rests on a side edge. `y` is where its centre is, as a fraction of the height. */
export interface Placement {
  edge: Edge;
  y: number;
}

export const BUTTON_SIZE = 64;
/** Room kept between the button and the screen edge: the listening rings reach about 20 px out. */
export const EDGE_MARGIN = 28;
/** How much of the button hides beyond the edge while it is tucked away. */
export const DOCKED_HIDDEN = 0.55;
export const DOCK_AFTER_MS = 5000;

export const DEFAULT_PLACEMENT: Placement = { edge: 'right', y: 0.82 };

const STORAGE_KEY = 'phibe-bubble-placement';

export function snapEdge(centreX: number, viewportWidth: number): Edge {
  return centreX < viewportWidth / 2 ? 'left' : 'right';
}

/** Keeps the whole button inside the screen vertically. Returns a fraction. */
export function clampFraction(y: number, viewportHeight: number, size = BUTTON_SIZE, margin = EDGE_MARGIN): number {
  if (viewportHeight <= size + margin * 2) return 0.5;
  const min = (margin + size / 2) / viewportHeight;
  const max = 1 - min;
  return Math.min(max, Math.max(min, Number.isFinite(y) ? y : DEFAULT_PLACEMENT.y));
}

/** Top-left corner of the button for a placement, in px. */
export function placementToTopLeft(
  p: Placement,
  viewportWidth: number,
  viewportHeight: number,
  docked = false,
  size = BUTTON_SIZE,
  margin = EDGE_MARGIN,
): { left: number; top: number } {
  const y = clampFraction(p.y, viewportHeight, size, margin);
  const top = Math.round(y * viewportHeight - size / 2);
  if (p.edge === 'left') {
    return { left: docked ? -Math.round(size * DOCKED_HIDDEN) : margin, top };
  }
  return { left: docked ? viewportWidth - Math.round(size * (1 - DOCKED_HIDDEN)) : viewportWidth - size - margin, top };
}

/** Where the button settles when it is let go with its centre at (x, y). */
export function placementFromDrop(centreX: number, centreY: number, viewportWidth: number, viewportHeight: number): Placement {
  return {
    edge: snapEdge(centreX, viewportWidth),
    y: clampFraction(viewportHeight > 0 ? centreY / viewportHeight : DEFAULT_PLACEMENT.y, viewportHeight),
  };
}

export function parsePlacement(raw: string | null): Placement {
  if (!raw) return { ...DEFAULT_PLACEMENT };
  try {
    const data = JSON.parse(raw) as Partial<Placement>;
    const edge: Edge = data.edge === 'left' ? 'left' : 'right';
    const y = typeof data.y === 'number' && Number.isFinite(data.y) ? Math.min(1, Math.max(0, data.y)) : DEFAULT_PLACEMENT.y;
    return { edge, y };
  } catch {
    return { ...DEFAULT_PLACEMENT };
  }
}

export function loadPlacement(): Placement {
  try {
    return parsePlacement(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PLACEMENT };
  }
}

export function savePlacement(p: Placement): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the spot only lasts until the page closes.
  }
}

/** The chat bubble opens towards the middle of the screen: above in the lower half, below in the upper half. */
export function popoverSide(p: Placement): { vertical: 'above' | 'below'; horizontal: Edge } {
  return { vertical: p.y > 0.5 ? 'above' : 'below', horizontal: p.edge };
}

// ---------------------------------------------------------------- badges

export type BadgeKind = 'approval' | 'question' | 'error' | 'draft' | 'done' | 'ping';

/** Most important first: only one badge shows, with a count when there are several things. */
export const BADGE_PRIORITY: readonly BadgeKind[] = ['approval', 'question', 'error', 'draft', 'done', 'ping'];

export function topBadge(counts: Partial<Record<BadgeKind, number>>): { kind: BadgeKind; total: number } | null {
  let total = 0;
  for (const k of BADGE_PRIORITY) total += Math.max(0, counts[k] ?? 0);
  if (total === 0) return null;
  const kind = BADGE_PRIORITY.find((k) => (counts[k] ?? 0) > 0) as BadgeKind;
  return { kind, total };
}
