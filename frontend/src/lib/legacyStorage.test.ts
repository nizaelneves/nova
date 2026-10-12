import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('legacyStorage', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    vi.resetModules();
  });

  it('copies phi-* keys to phibe-* once and keeps the old ones', async () => {
    localStorage.setItem('phi-settings', '{"theme":"dark"}');
    localStorage.setItem('phi-conversations', '{}');
    await import('./legacyStorage');
    expect(localStorage.getItem('phibe-settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('phibe-conversations')).toBe('{}');
    expect(localStorage.getItem('phi-settings')).toBe('{"theme":"dark"}');
  });

  it('never overwrites a phibe-* key that already exists', async () => {
    localStorage.setItem('phi-settings', 'old');
    localStorage.setItem('phibe-settings', 'new');
    await import('./legacyStorage');
    expect(localStorage.getItem('phibe-settings')).toBe('new');
  });
});
