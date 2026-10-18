import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(async () => ({ json: async () => ({ cpu: { usage: 12 }, network: { down: 5 } }) })),
}));

import { apiFetch } from '../../lib/api';
import { BACKGROUND_MS, WATCHED_MS, resetComputerFeed, startComputerFeed, useComputer, watchComputer } from './computerFeed';

beforeEach(() => { vi.useFakeTimers(); vi.mocked(apiFetch).mockClear(); resetComputerFeed(); });
afterEach(() => { resetComputerFeed(); vi.useRealTimers(); });

describe('computer feed', () => {
  it('reads once at start and keeps the last reading for whoever shows it later', async () => {
    startComputerFeed();
    startComputerFeed(); // starting twice changes nothing
    await vi.advanceTimersByTimeAsync(0);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(useComputer.getState().report?.cpu.usage).toBe(12);
    expect(useComputer.getState().cpuHistory).toEqual([12]);
  });

  it('reads slowly in the background and fast while a screen watches', async () => {
    startComputerFeed();
    await vi.advanceTimersByTimeAsync(BACKGROUND_MS);
    expect(vi.mocked(apiFetch).mock.calls.length).toBe(2); // the start and one slow tick
    vi.mocked(apiFetch).mockClear();
    const stop = watchComputer();
    await vi.advanceTimersByTimeAsync(WATCHED_MS * 3);
    expect(vi.mocked(apiFetch).mock.calls.length).toBe(4); // one at once, then every 2 s
    stop();
    vi.mocked(apiFetch).mockClear();
    await vi.advanceTimersByTimeAsync(WATCHED_MS * 3);
    expect(apiFetch).not.toHaveBeenCalled(); // back to the slow pace
  });
});
