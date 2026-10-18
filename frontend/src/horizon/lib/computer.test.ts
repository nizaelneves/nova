import { describe, expect, it } from 'vitest';
import { bytes, duration, percent, push, sparkline, speed } from './computer';

describe('computer formatting', () => {
  it('writes sizes and speeds the way people read them', () => {
    expect(bytes(0)).toBe('0 B');
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(15.8 * 1024 ** 3)).toBe('15.8 GB');
    expect(bytes(250 * 1024 ** 3)).toBe('250 GB');
    expect(bytes(-5)).toBe('0 B');
    expect(speed(2 * 1024 ** 2)).toBe('2.0 MB/s');
  });

  it('writes how long the computer has been on', () => {
    expect(duration(93_784)).toBe('1d 2h');
    expect(duration(4000)).toBe('1h 6m');
    expect(duration(90)).toBe('1m');
    expect(duration(5)).toBe('1m');
  });

  it('keeps only the latest readings', () => {
    expect(push([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(push([], 1)).toEqual([1]);
  });

  it('draws a line over the readings, and nothing until there are two', () => {
    expect(sparkline([5], 100, 20)).toBe('');
    expect(sparkline([0, 100], 100, 20, 100)).toBe('0.0,20.0 100.0,0.0');
    expect(sparkline([0, 50, 100], 100, 10)).toBe('0.0,10.0 50.0,5.0 100.0,0.0'); // scaled to its own highest reading
  });

  it('computes a share without dividing by zero', () => {
    expect(percent(25, 100)).toBe(25);
    expect(percent(1, 0)).toBe(0);
    expect(percent(200, 100)).toBe(100);
  });
});
