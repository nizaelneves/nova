import type { Ping } from './api';

const due = (p: Ping): Date => new Date(`${p.date}T${p.time || '00:00'}`);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One or two sentences on the open pings, in the voice of the other screens. */
export function summarizePings(pings: Ping[], now: Date): string {
  const open = pings.filter((p) => !p.completed);
  if (pings.length === 0) return 'No activity yet. Add a ping to get started.';
  if (open.length === 0) return 'Everything is done. Nice work.';
  const overdue = open.filter((p) => due(p) < now).length;
  const today = open.filter((p) => sameDay(due(p), now) && due(p) >= now).length;
  const next = [...open].filter((p) => due(p) >= now).sort((a, b) => due(a).getTime() - due(b).getTime())[0];
  const head = `${plural(open.length, 'open ping', 'open pings')}, ${overdue} overdue and ${today} due today.`;
  return next ? `${head} Next up: ${next.text}.` : head;
}
