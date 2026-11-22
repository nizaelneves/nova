import { describe, expect, it } from 'vitest';
import { groupItems, itemsByDate, monthGrid, nextStage, subProgress, visibleItems } from './board-view';
import type { Item, Property, ViewConfig } from './boards-api';

const opts = [{ id: 'todo', label: 'To-Do', color: '#000' }, { id: 'done', label: 'Concluído', color: '#0f0', done: true }];
const props: Property[] = [
  { id: 's', name: 'Status', type: 'status', options: opts },
  { id: 'd', name: 'Deadline', type: 'date', options: [] },
  { id: 't', name: 'Tags', type: 'tags', options: [{ id: 'x', label: 'x', color: '#000' }] },
];
const item = (id: string, values: Item['values'] = {}, parent_id: string | null = null): Item =>
  ({ id, board_id: 'b', parent_id, title: id, description: '', values, created_at: '', recurrence: null });
const items = [item('a', { s: 'done', d: '2026-11-03', t: ['x'] }), item('b', { s: 'todo', d: '2026-11-01' }), item('c', {}), item('sub', { s: 'done' }, 'a')];

describe('board view', () => {
  it('filters by status, tag and date, hides sub-items and ignores unfinished filters', () => {
    const ids = (config: ViewConfig, q = '') => visibleItems(items, props, config, q).map((i) => i.id);
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ filters: [{ prop: 's', op: 'is', value: 'todo' }] })).toEqual(['b']);
    expect(ids({ filters: [{ prop: 't', op: 'has', value: 'x' }] })).toEqual(['a']);
    expect(ids({ filters: [{ prop: 'd', op: 'before', value: '2026-11-02' }] })).toEqual(['b']);
    expect(ids({ filters: [{ prop: 's', op: 'is' }] })).toEqual(['a', 'b', 'c']);
    expect(ids({}, 'B')).toEqual(['b']);
  });

  it('sorts by date or option order, descending too', () => {
    const sorted = (prop: string, desc: boolean) => visibleItems(items, props, { sort: { prop, desc } }).map((i) => i.id);
    expect(sorted('d', false)).toEqual(['c', 'b', 'a']);
    expect(sorted('s', true)).toEqual(['a', 'b', 'c']);
  });

  it('groups by status with a catch-all and counts finished sub-items', () => {
    const groups = groupItems(visibleItems(items, props, {}), props, 's');
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['To-Do', 1], ['Concluído', 1], ['No value', 1]]);
    expect(groupItems(items, props, null)).toHaveLength(1);
    expect(subProgress(items, props, 'a')).toEqual({ total: 1, done: 1 });
  });

  it('advances stages up to the first done one and stops', () => {
    const flow: Property = { id: 'f', name: 'Fluxo', type: 'status', options: [...opts.slice(0, 1), { id: 'doing', label: 'Doing', color: '#000' }, opts[1], { id: 'x', label: 'Cancelado', color: '#f00', done: true }] };
    expect(nextStage(flow, undefined)?.id).toBe('todo');
    expect(nextStage(flow, 'todo')?.id).toBe('doing');
    expect(nextStage(flow, 'doing')?.id).toBe('done');
    expect(nextStage(flow, 'done')).toBeNull();
    expect(nextStage(flow, 'x')).toBeNull();
  });

  it('lays out a month and files items by date', () => {
    const grid = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-11-01');
    expect(grid[41]).toBe('2026-12-12');
    expect([...itemsByDate(items, 'd').keys()].sort()).toEqual(['2026-11-01', '2026-11-03']);
  });
});
