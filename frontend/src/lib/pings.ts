/**
 * Pure date/text logic for the Pings page — kept separate from the
 * component so it can be unit tested without rendering anything.
 */

/** Parses a `YYYY-MM-DD` + `HH:MM` pair into a local `Date` (never UTC —
 * building it from parts avoids the day/hour shift `new Date(iso)` can cause). */
export function pingDueDate(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0);
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st"... */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Short weekday labels, Sun-first (index matches JS `Date#getDay()`),
 * for the day-of-week chips in the New Ping modal. */
export const WEEKDAY_CHIPS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Full weekday names, Monday-first, matching the backend's `0=Mon..6=Sun`
 * convention for `repeat_days_of_week`. */
const WEEKDAY_NAMES_MON_FIRST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Converts a JS `Date#getDay()` value (0=Sun..6=Sat) to the backend's
 * `0=Mon..6=Sun` convention used by `repeat_days_of_week`. */
export function jsDayToBackendDay(jsDay: number): number {
  return (jsDay + 6) % 7;
}

interface RepeatRule {
  type: 'none' | 'weekly' | 'monthly';
  /** Every N week(s)/month(s). Defaults to 1 when omitted. */
  interval?: number;
  /** 0=Mon..6=Sun. Only used when `type === 'weekly'`. */
  daysOfWeek?: number[];
}

function shortDayNames(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES_MON_FIRST[d].slice(0, 3))
    .join(', ');
}

/** "Repeats every 2 weeks on Mon, Wed, Fri" / "Repeats every Saturday" /
 * "Repeats every 3 months on the 30th", from a `YYYY-MM-DD` date and the
 * chosen repeat rule. Returns '' for `type: 'none'` or an invalid date. */
export function repeatSummary(date: string, rule: RepeatRule): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;

  if (rule.type === 'weekly') {
    const days = rule.daysOfWeek ?? [];
    const every = interval === 1 ? 'week' : `${interval} weeks`;
    if (days.length === 0) {
      // Falls back to the date's own weekday, same as the backend does.
      const asDate = new Date(y, m - 1, d);
      const weekday = asDate.toLocaleDateString('en-US', { weekday: 'long' });
      return interval === 1 ? `Repeats every ${weekday}` : `Repeats every ${every} on ${weekday}`;
    }
    return `Repeats every ${every} on ${shortDayNames(days)}`;
  }

  if (rule.type === 'monthly') {
    const every = interval === 1 ? 'month' : `${interval} months`;
    return `Repeats every ${every} on the ${ordinal(d)}`;
  }

  return '';
}

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** "in 41 min" / "in 3 hr" / "in 2 days" / "Overdue by 12 min". Minutes and
 * hours use the fixed abbreviation (never pluralized); "day" pluralizes. */
export function formatCountdown(due: Date, now: Date = new Date()): string {
  const diffMs = due.getTime() - now.getTime();
  const overdue = diffMs <= 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);

  let body: string;
  if (minutes < 1) {
    body = 'under a minute';
  } else if (minutes < 60) {
    body = `${minutes} min`;
  } else if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    body = rem ? `${hours} hr ${rem} min` : `${hours} hr`;
  } else {
    const days = Math.floor(minutes / (60 * 24));
    body = pluralize(days, 'day');
  }
  return overdue ? `Overdue by ${body}` : `in ${body}`;
}

/** How far along, 0-100, *now* is between *start* and *due* — drives the
 * hero card's progress bar. Clamped so a ping created after its own due
 * time (or one already overdue) never goes out of range. */
export function progressPercent(start: Date, due: Date, now: Date = new Date()): number {
  const total = due.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - start.getTime();
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of a local date. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whether a ping lands on *day*, counting the repeats the backend would
 * generate (weekly on its chosen days every N weeks, monthly on the same day
 * every N months; a month without that day uses its last day). The saved date
 * is the next due one, so nothing earlier than it counts. */
export function occursOn(
  ping: { date: string; repeat_type: string; repeat_interval: number; repeat_days_of_week: number[] },
  day: Date,
): boolean {
  const first = pingDueDate(ping.date, '00:00');
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (d < first) return false;
  if (ping.repeat_type === 'none') return +d === +first;
  const every = Math.max(1, ping.repeat_interval);
  if (ping.repeat_type === 'weekly') {
    const days = ping.repeat_days_of_week.length ? ping.repeat_days_of_week : [jsDayToBackendDay(first.getDay())];
    if (!days.includes(jsDayToBackendDay(d.getDay()))) return false;
    const monday = (x: Date) => +x - jsDayToBackendDay(x.getDay()) * DAY_MS;
    return Math.round((monday(d) - monday(first)) / (7 * DAY_MS)) % every === 0;
  }
  const months = (d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth();
  if (months % every !== 0) return false;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === Math.min(first.getDate(), last);
}
