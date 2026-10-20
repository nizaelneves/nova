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

export type Counters = { open: number; openToday: number; done: number; doneWeek: number; overdue: number };

/** The numbers on top of the Projects home: what is open, what is done, what is late, and the recent change in each. */
export function counters(tasks: Task[], now: Date): Counters {
  const open = tasks.filter((t) => t.status !== 'done');
  const weekAgo = now.getTime() - 7 * 86_400_000;
  return {
    open: open.length,
    openToday: open.filter((t) => t.due.slice(0, 10) === dayOf(now)).length,
    done: tasks.length - open.length,
    doneWeek: tasks.filter((t) => t.status === 'done' && t.completed_at && new Date(t.completed_at).getTime() >= weekAgo).length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
  };
}

export type SortMode = 'ascending' | 'descending' | 'a-z' | 'z-a';

/** Orders the client projects: by when they were created (ascending = oldest first) or by name. Personal is placed by the caller. */
export function sortAreas<T extends { name: string }>(areas: T[], mode: SortMode): T[] {
  const copy = [...areas];
  if (mode === 'a-z') return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (mode === 'z-a') return copy.sort((a, b) => b.name.localeCompare(a.name));
  return mode === 'descending' ? copy.reverse() : copy;
}
