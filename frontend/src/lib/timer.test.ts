import { describe, expect, it } from 'vitest';
import { clock, finish, initial, pause, remaining, reset, setMinutes, start } from './timer';

const MIN = 60_000;

describe('timer', () => {
  it('counts down from the clock and keeps the time it had when paused', () => {
    const running = start(initial(25), 0);
    expect(remaining(running, 10 * MIN)).toBe(15 * MIN);
    const paused = pause(running, 10 * MIN);
    expect(remaining(paused, 99 * MIN)).toBe(15 * MIN); // time passing while paused changes nothing
    expect(remaining(start(paused, 50 * MIN), 55 * MIN)).toBe(10 * MIN);
  });

  it('stops and rewinds when it runs out, and not before', () => {
    const t = start(initial(25), 0);
    expect(finish(t, 24 * MIN)).toBe(t);
    const done = finish(t, 25 * MIN);
    expect(done.running).toBe(false);
    expect(remaining(done, 25 * MIN)).toBe(25 * MIN);
    const idle = initial(25);
    expect(finish(idle, 10 * 60 * MIN)).toBe(idle);
  });

  it('starts over, stopped, with a new length or a reset', () => {
    const half = pause(start(initial(25), 0), 5 * MIN);
    expect(remaining(setMinutes(half, 50), 0)).toBe(50 * MIN);
    expect(setMinutes(start(initial(25), 0), 50).running).toBe(false);
    expect(remaining(reset(half), 0)).toBe(25 * MIN);
  });

  it('writes minutes and seconds', () => {
    expect(clock(90_000)).toBe('01:30');
    expect(clock(1)).toBe('00:01');
    expect(clock(25 * MIN)).toBe('25:00');
  });
});
