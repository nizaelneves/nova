import { describe, expect, it } from 'vitest';
import { choiceLabel, choicesWith, minutesOf, timeOf, withChoice, withTime } from './syncRhythm';

const base = {
  interval_minutes: 360, daily_time: '03:00', disabled_connectors: ['slack'],
  intervals: { gmail: 60, notion: 0 }, daily_times: { notion: '09:30' },
};

describe('sync rhythm of a source', () => {
  it('names the six choices', () => {
    expect([0, 1440, 60, 180, 360, 720].map(choiceLabel)).toEqual([
      'Only When Phibe Starts', 'Once A Day At', 'Every Hour', 'Every 3 Hours', 'Every 6 Hours', 'Every 12 Hours',
    ]);
  });

  it('reads the own rhythm, or the general one', () => {
    expect(minutesOf(base, 'gmail')).toBe(60);
    expect(minutesOf(base, 'notion')).toBe(0);
    expect(minutesOf(base, 'slack')).toBe(360);
    expect(timeOf(base, 'notion')).toBe('09:30');
    expect(timeOf(base, 'slack')).toBe('03:00');
  });

  it('changes only the chosen source and switches it back on', () => {
    const next = withChoice(base, 'slack', 1440);
    expect(next.intervals).toEqual({ gmail: 60, notion: 0, slack: 1440 });
    expect(next.disabled_connectors).toEqual([]);
    expect(next.daily_times.slack).toBe('03:00');
    expect(withTime(base, 'gmail', '21:00').daily_times).toEqual({ notion: '09:30', gmail: '21:00' });
  });

  it('keeps a rhythm set by hand in the list and copes with old settings', () => {
    expect(choicesWith(45)).toContain(45);
    expect(choicesWith(60)).toHaveLength(6);
    expect(minutesOf({ ...base, intervals: undefined as never }, 'gmail')).toBe(360);
  });
});

describe('default rhythm', () => {
  it('follows the general one once the own rhythm is dropped', async () => {
    const { hasOwn, withDefault } = await import('./syncRhythm');
    const s = { interval_minutes: 60, daily_time: '03:00', disabled_connectors: [], intervals: { gmail: 360, notion: 0 }, daily_times: { gmail: '09:30' } };
    expect(hasOwn(s, 'gmail')).toBe(true);
    expect(hasOwn(s, 'slack')).toBe(false);
    expect(withDefault(s, 'gmail')).toEqual({ intervals: { notion: 0 }, daily_times: {} });
  });
});
