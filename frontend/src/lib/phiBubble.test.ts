import { describe, expect, it } from 'vitest';
import {
  BUTTON_SIZE,
  DEFAULT_PLACEMENT,
  clampFraction,
  parsePlacement,
  placementFromDrop,
  placementToTopLeft,
  popoverSide,
  snapEdge,
  topBadge,
} from './phiBubble';

describe('phiBubble placement', () => {
  it('snaps to the nearest side edge', () => {
    expect(snapEdge(100, 1000)).toBe('left');
    expect(snapEdge(900, 1000)).toBe('right');
  });

  it('keeps the whole button on screen vertically', () => {
    const vh = 800;
    const low = clampFraction(0, vh);
    const high = clampFraction(1, vh);
    expect(low * vh - BUTTON_SIZE / 2).toBeGreaterThanOrEqual(0);
    expect(high * vh + BUTTON_SIZE / 2).toBeLessThanOrEqual(vh);
    expect(clampFraction(0.5, 100)).toBe(0.5);
  });

  it('rests on the chosen edge, and tucks half out of sight when docked', () => {
    const right = placementToTopLeft({ edge: 'right', y: 0.5 }, 1000, 800);
    expect(right.left).toBe(1000 - BUTTON_SIZE - 16);
    const dockedRight = placementToTopLeft({ edge: 'right', y: 0.5 }, 1000, 800, true);
    expect(dockedRight.left).toBeGreaterThan(right.left);
    expect(dockedRight.left).toBeLessThan(1000);
    const dockedLeft = placementToTopLeft({ edge: 'left', y: 0.5 }, 1000, 800, true);
    expect(dockedLeft.left).toBeLessThan(0);
    expect(dockedLeft.left + BUTTON_SIZE).toBeGreaterThan(0);
  });

  it('turns a drop position into an edge and a height', () => {
    const p = placementFromDrop(120, 400, 1000, 800);
    expect(p.edge).toBe('left');
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it('reads stored placements safely', () => {
    expect(parsePlacement(null)).toEqual(DEFAULT_PLACEMENT);
    expect(parsePlacement('{oops')).toEqual(DEFAULT_PLACEMENT);
    expect(parsePlacement('{"edge":"left","y":0.3}')).toEqual({ edge: 'left', y: 0.3 });
    expect(parsePlacement('{"edge":"top","y":9}')).toEqual({ edge: 'right', y: 1 });
  });

  it('opens the chat bubble towards the middle of the screen', () => {
    expect(popoverSide({ edge: 'right', y: 0.9 })).toEqual({ vertical: 'above', horizontal: 'right' });
    expect(popoverSide({ edge: 'left', y: 0.1 })).toEqual({ vertical: 'below', horizontal: 'left' });
  });
});

describe('phiBubble badges', () => {
  it('shows nothing when nothing is waiting', () => {
    expect(topBadge({})).toBeNull();
    expect(topBadge({ approval: 0, done: 0 })).toBeNull();
  });

  it('shows the most important kind with the total count', () => {
    expect(topBadge({ done: 2, approval: 1 })).toEqual({ kind: 'approval', total: 3 });
    expect(topBadge({ ping: 1, done: 1 })).toEqual({ kind: 'done', total: 2 });
    expect(topBadge({ question: 1 })).toEqual({ kind: 'question', total: 1 });
  });
});
