import { describe, expect, it } from 'vitest';
import type { Ping } from '../../lib/api';
import type { Task } from '../../lib/tasks-api';
import { eventsByDay, isoDay, monthGrid } from './calendar';

describe('mini calendar', () => {
  it('shows six weeks that start on a Sunday and hold the whole month', () => {
    const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(0);
    expect(isoDay(grid[0])).toBe('2026-09-27');
    expect(grid.filter((d) => d.getMonth() === 9)).toHaveLength(31);
  });

  it('puts tasks, reminders and holidays on their days, and spreads a task with a start', () => {
    const task = (id: string, due: string, start: string | null = null) => ({ id, due, start }) as Task;
    const ping = (id: string, date: string, completed = false) => ({ id, date, completed }) as Ping;
    const days = eventsByDay(
      [task('a', '2026-10-12'), task('span', '2026-10-14T10:00', '2026-10-12')],
      [ping('p1', '2026-10-12'), ping('p2', '2026-10-13', true)],
      [{ date: '2026-10-12', name: 'Nossa Senhora Aparecida' }],
    );
    expect(days.get('2026-10-12')?.tasks.map((t) => t.id)).toEqual(['a', 'span']);
    expect(days.get('2026-10-13')?.tasks.map((t) => t.id)).toEqual(['span']);
    expect(days.get('2026-10-14')?.tasks.map((t) => t.id)).toEqual(['span']);
    expect(days.get('2026-10-15')).toBeUndefined();
    expect(days.get('2026-10-12')?.pings.map((p) => p.id)).toEqual(['p1']);
    expect(days.get('2026-10-13')?.pings).toEqual([]); // a finished reminder is left out
    expect(days.get('2026-10-12')?.holiday).toBe('Nossa Senhora Aparecida');
  });
});
