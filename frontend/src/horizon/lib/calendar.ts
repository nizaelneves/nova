import type { Ping } from '../../lib/api';
import type { Holiday } from '../../lib/holidaysBR';
import type { Task } from '../../lib/tasks-api';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The 42 days (six weeks, Sunday first) that show the month. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export interface DayEvents { tasks: Task[]; pings: Ping[]; holiday?: string }

/** Everything that happens on each day: tasks (a task with a start fills every day up to its due day), reminders, holidays. */
export function eventsByDay(tasks: Task[], pings: Ping[], holidays: Holiday[]): Map<string, DayEvents> {
  const days = new Map<string, DayEvents>();
  const at = (day: string): DayEvents => {
    let entry = days.get(day);
    if (!entry) { entry = { tasks: [], pings: [] }; days.set(day, entry); }
    return entry;
  };
  for (const t of tasks) {
    const from = (t.start ?? t.due).slice(0, 10);
    const to = t.due.slice(0, 10);
    for (let d = new Date(`${from}T00:00`), guard = 0; isoDay(d) <= to && guard < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), guard += 1) at(isoDay(d)).tasks.push(t);
  }
  for (const p of pings) if (!p.completed) at(p.date).pings.push(p);
  for (const h of holidays) at(h.date).holiday = h.name;
  return days;
}
