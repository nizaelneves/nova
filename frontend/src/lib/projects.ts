import type { Area, Task } from './tasks-api';

/** Colours handed to projects in the order they were created; personal tasks keep the neutral one. */
export const PROJECT_COLORS = ['#20e7aa', '#a78bfa', '#ffe3bd', '#10c3d3', '#ff6b6b', '#7dd3fc', '#f9a8d4'];
export const PERSONAL_COLOR = '#9aa3c7';

export function colorOf(areas: Area[]): (areaId: string | null) => string {
  const index = new Map(areas.map((a, i) => [a.id, i]));
  return (areaId) => (areaId && index.has(areaId) ? PROJECT_COLORS[index.get(areaId)! % PROJECT_COLORS.length] : PERSONAL_COLOR);
}

/** "Nizael Neves" -> "Nizael": the label of the personal bubble. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || 'Personal';

// ---- the week calendar

export interface Placed<T> {
  item: T;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for items that overlap in time; each item is `{ start, end }` in hours. */
export function layoutDay<T extends { start: number; end: number }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => { p.lanes = lanes; });
    out.push(...cluster);
    cluster = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) close();
    const taken = new Set(cluster.filter((p) => p.item.end > item.start).map((p) => p.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  close();
  return out;
}

// ---- the summary sentence and the week chart

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isOverdue = (t: Task, now: Date) => t.status !== 'done' && (t.all_day ? t.due < dayOf(now) : new Date(t.due) < now);

/** One or two sentences on how the activity is going. */
export function summarize(tasks: Task[], now: Date): string {
  if (tasks.length === 0) return 'No activity yet. Add a task to get started.';
  const open = tasks.filter((t) => t.status !== 'done');
  if (open.length === 0) return 'Everything is done. Nice work.';
  const overdue = open.filter((t) => isOverdue(t, now)).length;
  const today = open.filter((t) => t.due.slice(0, 10) === dayOf(now) && !isOverdue(t, now)).length;
  const next = [...open].sort((a, b) => a.due.localeCompare(b.due))[0];
  return `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}, ${overdue} overdue and ${today} due today. Next up: ${next.title}.`;
}

export type DayCount = { date: Date; done: number; open: number };

/** Tasks due on each day of the week that contains `now` (Sunday first), split into done and open. */
export function weekCounts(tasks: Task[], now: Date): DayCount[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + i);
    const due = tasks.filter((t) => t.due.slice(0, 10) === dayOf(date));
    return { date, done: due.filter((t) => t.status === 'done').length, open: due.filter((t) => t.status !== 'done').length };
  });
}
