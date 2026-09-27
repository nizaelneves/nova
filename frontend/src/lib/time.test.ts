import { describe, expect, it } from 'vitest';

import { timeAgo } from './time';

const NOW = Date.parse('2026-09-26T12:00:00Z');

describe('timeAgo', () => {
  it.each([
    [null, 'never'],
    ['2026-09-26T11:59:40Z', 'just now'],
    ['2026-09-26T11:55:00Z', '5 min ago'],
    ['2026-09-26T09:00:00Z', '3 h ago'],
    ['2026-09-24T12:00:00Z', '2 d ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(timeAgo(iso, NOW)).toBe(expected);
  });

  it('never shows a negative time when the clocks differ', () => {
    expect(timeAgo('2026-09-26T12:05:00Z', NOW)).toBe('just now');
  });
});
