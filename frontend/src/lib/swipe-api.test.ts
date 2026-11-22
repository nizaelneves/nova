import { describe, expect, it } from 'vitest';
import { formatDuration, formatSize } from './swipe-api';

describe('swipe file formatting', () => {
  it('writes a duration the way a player does', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(192)).toBe('3:12');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(NaN)).toBe('');
  });
  it('writes a size in MB or GB', () => {
    expect(formatSize(48_000_000)).toBe('48 MB');
    expect(formatSize(100)).toBe('1 MB');
    expect(formatSize(2_500_000_000)).toBe('2.5 GB');
  });
});
