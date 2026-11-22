import { describe, expect, it } from 'vitest';
import { type GraphEdge, type GraphNode, layout } from './graphLayout';

const note = (id: string): GraphNode => ({ id, type: 'note', label: id });

describe('layout', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map(note);
  const edges: GraphEdge[] = [{ a: 'a', b: 'b', type: 'link' }, { a: 'b', b: 'c', type: 'link' }, { a: 'a', b: 'c', type: 'link' }];
  const dist = (p: Map<string, { x: number; y: number }>, u: string, v: string) => Math.hypot(p.get(u)!.x - p.get(v)!.x, p.get(u)!.y - p.get(v)!.y);

  it('places every node at a real position, the same way every time', () => {
    const first = layout(nodes, edges);
    expect([...first.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(layout(nodes, edges).get('c')).toEqual(first.get('c'));
  });

  it('keeps linked notes closer together than notes with no link', () => {
    const p = layout(nodes, edges);
    expect(dist(p, 'a', 'b')).toBeLessThan(dist(p, 'a', 'f'));
  });

  it('ignores edges that point at a missing node', () => {
    expect(layout(nodes, [{ a: 'a', b: 'zzz', type: 'tag' }]).size).toBe(6);
  });
});
