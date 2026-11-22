import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, buildGroups } from './task-table';
import type { Area, Task } from './tasks-api';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, notes: '', area_id: null, area: '', start: null, due: '2026-11-01', all_day: true,
  priority: null, status: 'todo', recurrence: null, series_id: null, created_at: '', completed_at: null, ...over,
});
const areas: Area[] = [{ id: 'a1', name: 'Zeta', task_count: 1 }, { id: 'a2', name: 'Alpha', task_count: 1 }];

describe('buildGroups', () => {
  it('keeps every stage, even empty, and sorts by due date', () => {
    const groups = buildGroups([task('b', { due: '2026-11-03' }), task('a', { due: '2026-11-02' })], areas, DEFAULT_VIEW);
    expect(groups.map((g) => g.key)).toEqual(['todo', 'doing', 'done']);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['a', 'b']);
    expect(groups[1].tasks).toEqual([]);
  });

  it('filters by search text and priority before grouping', () => {
    const tasks = [task('x', { priority: 'high', title: 'Write report' }), task('y', { priority: 'low', title: 'Write plan' })];
    const [todo] = buildGroups(tasks, areas, { ...DEFAULT_VIEW, query: 'write', priority: 'high' });
    expect(todo.tasks.map((t) => t.id)).toEqual(['x']);
  });

  it('groups by project with Personal first and hides empty groups', () => {
    const groups = buildGroups([task('p'), task('z', { area_id: 'a1' })], areas, { ...DEFAULT_VIEW, groupBy: 'project' });
    expect(groups.map((g) => g.label)).toEqual(['Personal', 'Zeta']);
    expect(groups[1].defaults).toEqual({ area_id: 'a1' });
  });

  it('sorts descending and gives new tasks in a priority group that priority', () => {
    const tasks = [task('m', { priority: 'medium' }), task('h', { priority: 'high' })];
    const groups = buildGroups(tasks, areas, { ...DEFAULT_VIEW, groupBy: 'none', sort: 'priority', desc: true });
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['m', 'h']);
    expect(buildGroups(tasks, areas, { ...DEFAULT_VIEW, groupBy: 'priority' })[0].defaults).toEqual({ priority: 'high' });
  });
});
