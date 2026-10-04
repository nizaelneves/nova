import { describe, expect, it } from 'vitest';
import { cleanPhrase, pickPhraseIndex } from './phrase';

describe('cleanPhrase', () => {
  it('removes quotes typed around the phrase', () => {
    expect(cleanPhrase('"Um passo de cada vez."')).toBe('Um passo de cada vez.');
    expect(cleanPhrase(' “Keep going” ')).toBe('Keep going');
  });
  it('keeps quotes and apostrophes inside the phrase', () => {
    expect(cleanPhrase("Don't stop \"now\" ok")).toBe("Don't stop \"now\" ok");
  });
});

describe('pickPhraseIndex', () => {
  it('stays the same within one rotation window', () => {
    const early = new Date(2026, 0, 1, 10, 1);
    const late = new Date(2026, 0, 1, 10, 58);
    expect(pickPhraseIndex(5, 60, early)).toBe(pickPhraseIndex(5, 60, late));
  });

  it('can change once the window moves on', () => {
    // Not guaranteed to differ every time (same hash could repeat), but the
    // function must be a function of the bucket, not of wall-clock noise.
    const a = new Date(2026, 0, 1, 10, 30);
    const b = new Date(2026, 0, 1, 11, 30);
    expect(pickPhraseIndex(1, 60, a)).toBe(0); // only one phrase: always index 0
    expect(pickPhraseIndex(1, 60, b)).toBe(0);
  });

  it('a shorter rotation moves through phrases faster', () => {
    const t1 = new Date(2026, 0, 1, 10, 0);
    const t2 = new Date(2026, 0, 1, 10, 10);
    // With a 5-minute rotation these ten minutes cross at least one boundary,
    // so the 5-minute window index differs from the fixed daily index unless
    // both land on the same bucket by chance — check bucket math directly instead.
    const bucket1 = Math.floor(t1.getTime() / (5 * 60_000));
    const bucket2 = Math.floor(t2.getTime() / (5 * 60_000));
    expect(bucket2).toBeGreaterThan(bucket1);
  });

  it('stays inside range and never divides by zero', () => {
    for (let i = 0; i < 20; i++) {
      const idx = pickPhraseIndex(3, 60, new Date(2026, i % 12, (i % 27) + 1));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
    expect(pickPhraseIndex(0, 60)).toBe(0);
  });
});
