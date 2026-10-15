import { describe, expect, it } from 'vitest';
import { PERSONAL_COLOR, PROJECT_COLORS, colorOf, firstName, layoutDay, summarize, weekCounts } from './projects';
import { type Area, type Task } from './tasks-api';
import { EMPTY_WORKSPACES, addWorkspace, parseWorkspaces, setAbout } from './workspaces';

const area = (id: string) => ({ id, name: id, position: 0, task_count: 0 }) as unknown as Area;

describe('project colours and names', () => {
  it('gives each project its own colour in creation order, and personal tasks the neutral one', () => {
    const color = colorOf([area('a'), area('b')]);
    expect(color('a')).toBe(PROJECT_COLORS[0]);
    expect(color('b')).toBe(PROJECT_COLORS[1]);
    expect(color(null)).toBe(PERSONAL_COLOR);
    expect(color('gone')).toBe(PERSONAL_COLOR);
  });

  it('uses the first name for the personal bubble', () => {
    expect(firstName('Nizael Neves')).toBe('Nizael');
    expect(firstName('  ')).toBe('Personal');
  });
});

describe('layoutDay', () => {
  it('puts overlapping items in side-by-side lanes and leaves the rest full width', () => {
    const placed = layoutDay([
      { start: 9, end: 10 },
      { start: 9.5, end: 11 },
      { start: 13, end: 14 },
    ]);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
});

describe('client knowledge notes', () => {
  it('keeps notes per client and drops anything that is not text when loading', () => {
    const d = addWorkspace(structuredClone(EMPTY_WORKSPACES), 'Aurora');
    const id = d.workspaces[0].id;
    const noted = setAbout(d, id, 'Mission', 'Good coffee');
    expect(noted.workspaces[0].about).toEqual({ Mission: 'Good coffee' });
    const reloaded = parseWorkspaces(JSON.stringify({ ...noted, workspaces: [{ ...noted.workspaces[0], about: { Mission: 'ok', Bad: 3 } }] }));
    expect(reloaded.workspaces[0].about).toEqual({ Mission: 'ok' });
  });
});

describe('summary and week bars', () => {
  const now = new Date(2026, 9, 14, 12, 0); // Wednesday
  const task = (title: string, due: string, status: Task['status'] = 'todo', all_day = false) => ({ title, due, status, all_day }) as Task;

  it('says what to do when empty, and counts open, overdue and due today otherwise', () => {
    expect(summarize([], now)).toContain('No activity yet');
    expect(summarize([task('a', '2026-10-14T10:00', 'done')], now)).toBe('Everything is done. Nice work.');
    const tasks = [task('Old', '2026-10-12', 'todo', true), task('Today', '2026-10-14T15:00'), task('Later', '2026-10-20', 'todo', true)];
    expect(summarize(tasks, now)).toBe('3 open tasks, 1 overdue and 1 due today. Next up: Old.');
  });

  it('counts done and open tasks per day, Sunday first', () => {
    const week = weekCounts([task('a', '2026-10-14T10:00', 'done'), task('b', '2026-10-14', 'todo', true), task('c', '2026-10-17', 'todo', true)], now);
    expect(week.map((d) => d.date.getDate())).toEqual([11, 12, 13, 14, 15, 16, 17]);
    expect([week[3].done, week[3].open, week[6].open]).toEqual([1, 1, 1]);
  });
});
