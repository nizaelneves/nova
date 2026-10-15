import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLOW, loadFlow, saveFlow, toSvg } from './flow';

describe('flow storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });

  it('starts with the example and keeps each project apart', () => {
    expect(loadFlow('a')).toBe(DEFAULT_FLOW);
    saveFlow('a', 'Start\n  End');
    expect(loadFlow('a')).toBe('Start\n  End');
    expect(loadFlow('b')).toBe(DEFAULT_FLOW);
  });
});

describe('toSvg', () => {
  it('draws every box and arrow, and escapes the text', () => {
    const svg = toSvg(
      [{ id: 'a', label: 'A & B', x: 0, y: 0, w: 80, h: 30 }, { id: 'b', label: '<End>', x: 0, y: 100, w: 80, h: 30 }],
      [{ source: 'a', target: 'b', label: 'yes' }, { source: 'a', target: 'missing', label: '' }],
    );
    expect(svg.match(/<rect /g)).toHaveLength(3); // background + two boxes
    expect(svg.match(/<line /g)).toHaveLength(1); // the link to a missing box is skipped
    expect(svg).toContain('A &amp; B');
    expect(svg).toContain('&lt;End&gt;');
    expect(svg).toContain('yes');
  });
});
