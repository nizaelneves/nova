import { describe, expect, it } from 'vitest';
import { Task } from './tasks-api';
import {
  hourHeightPercent,
  isSameLocalDay,
  LIST_BUCKET_ORDER,
  minutesFromRangeStart,
  nowLinePercent,
  shiftDateStr,
  taskListBucket,
  timePositionPercent,
} from './tasks';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Test',
    notes: '',
    area_id: 'a1',
    area: 'Personal',
    start: null,
    due: '2026-09-30T09:30',
    all_day: false,
    priority: null,
    status: 'todo',
    recurrence: null,
    series_id: null,
    created_at: '2026-09-01T00:00',
    completed_at: null,
    ...overrides,
  };
}

describe('shiftDateStr', () => {
  it('shifts forward and backward without UTC day-shift bugs', () => {
    expect(shiftDateStr('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftDateStr('2026-09-30', -1)).toBe('2026-09-29');
    expect(shiftDateStr('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('isSameLocalDay', () => {
  it('compares calendar day, not exact time', () => {
    expect(isSameLocalDay(new Date(2026, 8, 30, 1, 0), new Date(2026, 8, 30, 23, 59))).toBe(true);
    expect(isSameLocalDay(new Date(2026, 8, 30), new Date(2026, 8, 29))).toBe(false);
  });
});

describe('taskListBucket', () => {
  const now = new Date(2026, 8, 30, 12, 0); // Sep 30, 2026, noon
  const todayStr = '2026-09-30';

  it('buckets a done task as done regardless of date', () => {
    const t = makeTask({ status: 'done', due: '2020-01-01' });
    expect(taskListBucket(t, now, todayStr)).toBe('done');
  });

  it('buckets a timed task earlier today as overdue', () => {
    const t = makeTask({ due: '2026-09-30T09:00', all_day: false });
    expect(taskListBucket(t, now, todayStr)).toBe('overdue');
  });

  it('buckets a timed task later today as today (not overdue)', () => {
    const t = makeTask({ due: '2026-09-30T18:00', all_day: false });
    expect(taskListBucket(t, now, todayStr)).toBe('today');
  });

  it('buckets an all-day task due today as today', () => {
    const t = makeTask({ due: '2026-09-30', all_day: true });
    expect(taskListBucket(t, now, todayStr)).toBe('today');
  });

  it('buckets an all-day task due yesterday as overdue', () => {
    const t = makeTask({ due: '2026-09-29', all_day: true });
    expect(taskListBucket(t, now, todayStr)).toBe('overdue');
  });

  it('buckets tomorrow correctly', () => {
    const t = makeTask({ due: '2026-10-01', all_day: true });
    expect(taskListBucket(t, now, todayStr)).toBe('tomorrow');
  });

  it('buckets within a week as week', () => {
    const t = makeTask({ due: '2026-10-05', all_day: true });
    expect(taskListBucket(t, now, todayStr)).toBe('week');
  });

  it('buckets beyond a week as later', () => {
    const t = makeTask({ due: '2026-11-01', all_day: true });
    expect(taskListBucket(t, now, todayStr)).toBe('later');
  });

  it('has a stable, complete bucket order', () => {
    expect(LIST_BUCKET_ORDER).toEqual(['overdue', 'today', 'tomorrow', 'week', 'later', 'done']);
  });
});

describe('minutesFromRangeStart', () => {
  it('computes minutes since the start hour', () => {
    expect(minutesFromRangeStart(new Date(2026, 8, 30, 9, 30), 6)).toBe(210);
    expect(minutesFromRangeStart(new Date(2026, 8, 30, 6, 0), 6)).toBe(0);
  });
});

describe('timePositionPercent', () => {
  it('places the start hour at 0% and end hour at 100%', () => {
    expect(timePositionPercent(new Date(2026, 8, 30, 6, 0), 6, 23)).toBe(0);
    expect(timePositionPercent(new Date(2026, 8, 30, 23, 0), 6, 23)).toBe(100);
  });

  it('places 9:30am correctly within a 6am-11pm range', () => {
    // 6am-11pm = 17 hours = 1020 minutes. 9:30am = 210 minutes in.
    expect(timePositionPercent(new Date(2026, 8, 30, 9, 30), 6, 23)).toBeCloseTo((210 / 1020) * 100, 5);
  });

  it('clamps times outside the visible range', () => {
    expect(timePositionPercent(new Date(2026, 8, 30, 2, 0), 6, 23)).toBe(0);
    expect(timePositionPercent(new Date(2026, 8, 30, 23, 59), 6, 23)).toBe(100);
  });
});

describe('hourHeightPercent', () => {
  it('divides the grid evenly across the hour range', () => {
    expect(hourHeightPercent(6, 23)).toBeCloseTo(100 / 17, 5);
    expect(hourHeightPercent(0, 24)).toBeCloseTo(100 / 24, 5);
  });
});

describe('nowLinePercent', () => {
  it('returns null when the viewed day is not today', () => {
    const now = new Date(2026, 8, 30, 10, 0);
    expect(nowLinePercent(now, '2026-09-29', 6, 23)).toBeNull();
    expect(nowLinePercent(now, '2026-10-01', 6, 23)).toBeNull();
  });

  it('returns a position when the viewed day is today', () => {
    const now = new Date(2026, 8, 30, 10, 0);
    expect(nowLinePercent(now, '2026-09-30', 6, 23)).not.toBeNull();
  });
});
