import { describe, expect, it } from 'vitest';
import type { Ping } from './api';
import { summarizePings } from './pingsSummary';

const ping = (text: string, date: string, time: string, completed = false) => ({ text, date, time, completed }) as Ping;
const now = new Date(2026, 9, 18, 12, 0);

describe('pings summary', () => {
  it('says what to do when there are no pings, and when all are done', () => {
    expect(summarizePings([], now)).toBe('No activity yet. Add a ping to get started.');
    expect(summarizePings([ping('a', '2026-10-18', '09:00', true)], now)).toBe('Everything is done. Nice work.');
  });

  it('counts open, overdue and due today, and names the next one', () => {
    const pings = [ping('Old', '2026-10-17', '09:00'), ping('Evening walk', '2026-10-18', '19:00'), ping('Call mom', '2026-10-22', '18:30'), ping('Done', '2026-10-18', '15:00', true)];
    expect(summarizePings(pings, now)).toBe('3 open pings, 1 overdue and 1 due today. Next up: Evening walk.');
  });

  it('writes one open ping in the singular and has no next when all are late', () => {
    expect(summarizePings([ping('Late', '2026-10-17', '09:00')], now)).toBe('1 open ping, 1 overdue and 0 due today.');
  });
});
