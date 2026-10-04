/**
 * Pure date/positioning logic for the Tasks page's List and Calendar views —
 * kept separate from the component so it can be unit tested without
 * rendering anything (mirrors the split between PingsPage.tsx and pings.ts).
 */

import { Task } from './tasks-api';

/** Shifts a `YYYY-MM-DD` date string by `days` (may be negative), returning
 * a new `YYYY-MM-DD` string. Built from local date parts (never
 * `toISOString()`) so it never shifts a day via UTC conversion. */
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** True when two `Date`s fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ---------------------------------------------------------------------------
// List view grouping
// ---------------------------------------------------------------------------

export type ListBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'done';

export const LIST_BUCKET_ORDER: ListBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'done'];

export const LIST_BUCKET_LABEL: Record<ListBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  done: 'Done',
};

/** Buckets a task for the List view's grouped-section headers. Mirrors the
 * "is this task past due" logic already used by the Kanban tab filter (an
 * all-day task is overdue once its date has passed; a timed task is overdue
 * once its exact due instant has passed) so the two views never disagree
 * about what counts as overdue. */
export function taskListBucket(task: Task, now: Date, todayStr: string): ListBucket {
  if (task.status === 'done') return 'done';
  const day = task.due.slice(0, 10);
  const isPast = task.all_day ? day < todayStr : new Date(task.due) < now;
  if (isPast) return 'overdue';
  if (day === todayStr) return 'today';
  if (day === shiftDateStr(todayStr, 1)) return 'tomorrow';
  if (day <= shiftDateStr(todayStr, 7)) return 'week';
  return 'later';
}

// ---------------------------------------------------------------------------
// Calendar (single-day timeline) view
// ---------------------------------------------------------------------------

/** Minutes elapsed since `startHour:00` on `date`'s own day (may be negative
 * or exceed the visible range — callers clamp with `timePositionPercent`). */
export function minutesFromRangeStart(date: Date, startHour: number): number {
  return (date.getHours() - startHour) * 60 + date.getMinutes();
}

/** Vertical position of `date`'s time-of-day within an `[startHour, endHour)`
 * timeline, as a 0-100 percentage of the grid's height. Clamped to the
 * visible range so a task just outside the window still renders at an edge
 * rather than disappearing. */
export function timePositionPercent(date: Date, startHour: number, endHour: number): number {
  const totalMinutes = (endHour - startHour) * 60;
  if (totalMinutes <= 0) return 0;
  const mins = minutesFromRangeStart(date, startHour);
  return Math.max(0, Math.min(100, (mins / totalMinutes) * 100));
}

/** Height, as a 0-100 percentage of the grid, that one hour occupies. */
export function hourHeightPercent(startHour: number, endHour: number): number {
  const totalHours = endHour - startHour;
  if (totalHours <= 0) return 0;
  return 100 / totalHours;
}

/** The "now" indicator's vertical position, or `null` when `now` isn't on
 * the same local day as `viewedDateStr` (the line only ever shows on
 * today's timeline). */
export function nowLinePercent(now: Date, viewedDateStr: string, startHour: number, endHour: number): number | null {
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (viewedDateStr !== todayStr) return null;
  return timePositionPercent(now, startHour, endHour);
}
