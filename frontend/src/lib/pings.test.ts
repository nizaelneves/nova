import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  occursOn,
  jsDayToBackendDay,
  ordinal,
  pingDueDate,
  progressPercent,
  repeatSummary,
} from './pings';

describe('pingDueDate', () => {
  it('builds a local date from parts, never shifting the day via UTC', () => {
    const d = pingDueDate('2026-10-30', '23:45');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9); // October, 0-indexed
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(45);
  });
});

describe('ordinal', () => {
  it('handles the common suffixes', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
  });
  it('the 11th-13th are all "th", not "st"/"nd"/"rd"', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(111)).toBe('111th');
  });
});

describe('repeatSummary', () => {
  it('describes a plain weekly repeat (no days picked) by weekday name', () => {
    // 2026-10-30 is a Friday.
    expect(repeatSummary('2026-10-30', { type: 'weekly' })).toBe('Repeats every Friday');
  });
  it('describes a weekly repeat with an interval and no days picked', () => {
    expect(repeatSummary('2026-10-30', { type: 'weekly', interval: 2 })).toBe(
      'Repeats every 2 weeks on Friday',
    );
  });
  it('describes a weekly repeat on specific days of the week', () => {
    // 0=Mon, 2=Wed, 4=Fri
    expect(repeatSummary('2026-10-30', { type: 'weekly', daysOfWeek: [0, 2, 4] })).toBe(
      'Repeats every week on Mon, Wed, Fri',
    );
    expect(
      repeatSummary('2026-10-30', { type: 'weekly', interval: 2, daysOfWeek: [4, 0, 2] }),
    ).toBe('Repeats every 2 weeks on Mon, Wed, Fri');
  });
  it('describes a monthly repeat by day of month with an ordinal', () => {
    expect(repeatSummary('2026-10-30', { type: 'monthly' })).toBe('Repeats every month on the 30th');
    expect(repeatSummary('2026-10-01', { type: 'monthly' })).toBe('Repeats every month on the 1st');
  });
  it('describes a monthly repeat with an interval', () => {
    expect(repeatSummary('2026-10-30', { type: 'monthly', interval: 3 })).toBe(
      'Repeats every 3 months on the 30th',
    );
  });
  it('returns an empty string for "none" or an invalid date', () => {
    expect(repeatSummary('2026-10-30', { type: 'none' })).toBe('');
    expect(repeatSummary('', { type: 'weekly' })).toBe('');
  });
});

describe('weekday conversion from JS (0=Sun) to backend (0=Mon)', () => {
  it('converts JS getDay() values to the backend convention', () => {
    expect(jsDayToBackendDay(0)).toBe(6); // Sunday
    expect(jsDayToBackendDay(1)).toBe(0); // Monday
    expect(jsDayToBackendDay(6)).toBe(5); // Saturday
  });
});

describe('formatCountdown', () => {
  const now = new Date(2026, 9, 30, 14, 0);

  it('rounds to minutes when under an hour away', () => {
    expect(formatCountdown(new Date(2026, 9, 30, 14, 41), now)).toBe('in 41 min');
  });
  it('shows hours (and remaining minutes) under a day away', () => {
    expect(formatCountdown(new Date(2026, 9, 30, 17, 0), now)).toBe('in 3 hr');
    expect(formatCountdown(new Date(2026, 9, 30, 17, 30), now)).toBe('in 3 hr 30 min');
  });
  it('shows days when a day or more away', () => {
    expect(formatCountdown(new Date(2026, 10, 2, 14, 0), now)).toBe('in 3 days');
  });
  it('flags a past due time as overdue', () => {
    expect(formatCountdown(new Date(2026, 9, 30, 13, 45), now)).toBe('Overdue by 15 min');
  });
});

describe('progressPercent', () => {
  it('is 0 right at the start and 100 right at the due time', () => {
    const start = new Date(2026, 9, 30, 12, 0);
    const due = new Date(2026, 9, 30, 14, 0);
    expect(progressPercent(start, due, start)).toBe(0);
    expect(progressPercent(start, due, due)).toBe(100);
  });
  it('is 50 halfway between start and due', () => {
    const start = new Date(2026, 9, 30, 12, 0);
    const due = new Date(2026, 9, 30, 14, 0);
    const half = new Date(2026, 9, 30, 13, 0);
    expect(progressPercent(start, due, half)).toBe(50);
  });
  it('clamps instead of going out of range when already overdue', () => {
    const start = new Date(2026, 9, 30, 12, 0);
    const due = new Date(2026, 9, 30, 14, 0);
    const late = new Date(2026, 9, 30, 20, 0);
    expect(progressPercent(start, due, late)).toBe(100);
  });
});

describe('occursOn', () => {
  const base = { repeat_interval: 1, repeat_days_of_week: [] as number[] };
  const at = (iso: string) => pingDueDate(iso, '00:00');

  it('matches a one-off only on its own day', () => {
    const p = { ...base, date: '2026-10-14', repeat_type: 'none' };
    expect(occursOn(p, at('2026-10-14'))).toBe(true);
    expect(occursOn(p, at('2026-10-21'))).toBe(false);
  });

  it('repeats weekly on the chosen days and every N weeks, never before the saved date', () => {
    const p = { date: '2026-10-12', repeat_type: 'weekly', repeat_interval: 2, repeat_days_of_week: [0, 2] }; // Mon, Wed
    expect(occursOn(p, at('2026-10-14'))).toBe(true);
    expect(occursOn(p, at('2026-10-19'))).toBe(false); // off week
    expect(occursOn(p, at('2026-10-26'))).toBe(true);
    expect(occursOn(p, at('2026-10-05'))).toBe(false);
  });

  it('repeats monthly on the same day, clamped on short months', () => {
    const p = { ...base, date: '2026-01-31', repeat_type: 'monthly' };
    expect(occursOn(p, at('2026-02-28'))).toBe(true);
    expect(occursOn(p, at('2026-03-31'))).toBe(true);
    expect(occursOn(p, at('2026-03-30'))).toBe(false);
  });
});
