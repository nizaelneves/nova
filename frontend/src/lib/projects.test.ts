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

describe('counters', () => {
  it('counts what is open, done and late, with the recent change', async () => {
    const { counters } = await import('./projects');
    const now = new Date('2026-10-15T12:00:00');
    const t = (o: Partial<Task>) => ({ status: 'todo', all_day: true, due: '2026-10-15', completed_at: null, ...o }) as unknown as Task;
    const tasks = [t({}), t({ due: '2026-10-10' }), t({ status: 'done', completed_at: '2026-10-14T09:00:00' }), t({ status: 'done', completed_at: '2026-09-01T09:00:00' })];
    expect(counters(tasks, now)).toEqual({ open: 2, openToday: 1, done: 2, doneWeek: 1, overdue: 1 });
  });
});

describe('sortAreas', () => {
  it('orders by creation or by name without touching the input', async () => {
    const { sortAreas } = await import('./projects');
    const list = [{ name: 'Beta' }, { name: 'alpha' }, { name: 'Gamma' }];
    expect(sortAreas(list, 'ascending').map((a) => a.name)).toEqual(['Beta', 'alpha', 'Gamma']);
    expect(sortAreas(list, 'descending').map((a) => a.name)).toEqual(['Gamma', 'alpha', 'Beta']);
    expect(sortAreas(list, 'a-z').map((a) => a.name)).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(sortAreas(list, 'z-a').map((a) => a.name)).toEqual(['Gamma', 'Beta', 'alpha']);
    expect(list[0].name).toBe('Beta');
  });
});


describe('results', () => {
  it('sums up what was delivered, on time and how fast', async () => {
    const { results } = await import('./projects');
    const now = new Date('2026-10-15T12:00:00'); // Thursday; this week starts Sunday the 11th
    const t = (o: Partial<Task>) => ({ status: 'done', due: '2026-10-14', created_at: '2026-10-12T00:00:00', completed_at: '2026-10-13T00:00:00', ...o }) as unknown as Task;
    const tasks = [t({}), t({ completed_at: '2026-10-20T00:00:00' }), t({ status: 'todo', completed_at: null })];
    const r = results(tasks, now);
    expect(r).toMatchObject({ done: 2, rate: 67, onTime: 50, avgDays: 4.5 });
    expect(r.weeks).toHaveLength(8);
    expect(r.weeks[7].done).toBe(1); // the week of the 11th
    expect(r.delivered[0].completed_at).toBe('2026-10-20T00:00:00');
  });

  it('is all zeros for a project with nothing done', async () => {
    const { results } = await import('./projects');
    expect(results([], new Date())).toMatchObject({ done: 0, rate: 0, onTime: 0, avgDays: 0, delivered: [] });
  });
});
