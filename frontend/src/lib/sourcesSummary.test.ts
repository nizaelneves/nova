import { describe, expect, it } from 'vitest';
import { summarizeSources } from './sourcesSummary';

describe('sources summary', () => {
  it('says what to do when nothing is connected', () => {
    expect(summarizeSources([])).toBe('No sources connected yet. Turn one on to get started.');
    expect(summarizeSources([{ connected: false, chunks: 0 }])).toBe('No sources connected yet. Turn one on to get started.');
  });

  it('counts connected sources and indexed items', () => {
    const s = [{ connected: true, chunks: 2751 }, { connected: true, chunks: 157 }, { connected: false, chunks: 0 }];
    expect(summarizeSources(s)).toBe('Connected 2 of 3 sources, with 2908 items indexed.');
    expect(summarizeSources([{ connected: true, chunks: 1 }])).toBe('Connected 1 of 1 sources, with 1 item indexed.');
  });

  it('flags the ones that failed', () => {
    const s = [{ connected: true, chunks: 5, failing: true }, { connected: true, chunks: 5 }, { connected: true, chunks: 5, failing: true }];
    expect(summarizeSources(s)).toBe('Connected 3 of 3 sources, with 15 items indexed. 2 need attention.');
    expect(summarizeSources([{ connected: true, chunks: 5, failing: true }])).toContain('1 needs attention.');
  });

  it('adds how many tools are ready', () => {
    expect(summarizeSources([{ connected: true, chunks: 2 }], { ready: 43, total: 48 })).toBe('Connected 1 of 1 sources, with 2 items indexed. 43 of 48 tools are ready.');
    expect(summarizeSources([], { ready: 1, total: 2 })).toBe('No sources connected yet. Turn one on to get started. 1 of 2 tools are ready.');
  });
});
