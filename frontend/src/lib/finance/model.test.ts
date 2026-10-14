import { describe, expect, it } from 'vitest';
import { EMPTY_OVERVIEW, parseCents, presetRange, rangeLabel, summarize } from './model';
import { legacyPayload } from './store';

describe('periods', () => {
  it('defaults the month preset to the 1st through today', () => {
    expect(presetRange('month', '2026-10-11')).toEqual({ preset: 'month', from: '2026-10-01', to: '2026-10-11' });
    expect(rangeLabel(presetRange('month', '2026-10-11'))).toBe('This Month');
    expect(rangeLabel(presetRange('3m', '2026-10-11'))).toBe('Last 3 Months');
    expect(presetRange('7d', '2026-10-11').from).toBe('2026-10-05');
  });
});

describe('parseCents', () => {
  it('treats the last comma or dot as the decimal mark', () => {
    expect(parseCents('19,99')).toBe(1999);
    expect(parseCents('1.234,56')).toBe(123456);
    expect(parseCents('1,234.56')).toBe(123456);
    expect(parseCents('1234')).toBe(123400);
    expect(parseCents('0.1')).toBe(10);
  });
  it('rejects text with no digits', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
  });
});

describe('summary', () => {
  it('says so when there is no activity, and compares spending otherwise', () => {
    expect(summarize(EMPTY_OVERVIEW)).toContain('No activity');
    const text = summarize({ ...EMPTY_OVERVIEW, totals: { income: 500_00, expenses: 200_00, savings: 0 }, deltas: { ...EMPTY_OVERVIEW.deltas, expenses: -12.5 } });
    expect(text).toContain('ahead');
    expect(text).toContain('12.5% lower');
  });
});

describe('moving browser finances to the server', () => {
  const saved = JSON.stringify({
    state: {
      accounts: [{ id: 'a', name: 'Bank', opening: 1 }],
      categories: [{ id: 'food' }, { id: 'other' }, { id: 'other-income' }],
      txs: [{ id: '1', categoryId: 'other' }, { id: '2', categoryId: 'food' }],
    },
  });

  it('drops the old Other categories and uncategorizes what used them', () => {
    const p = legacyPayload(saved) as { categories: { id: string }[]; transactions: { categoryId: string }[] };
    expect(p.categories.map((c) => c.id)).toEqual(['food']);
    expect(p.transactions.map((t) => t.categoryId)).toEqual(['', 'food']);
  });

  it('returns null when nothing usable was saved', () => {
    expect(legacyPayload(null)).toBeNull();
    expect(legacyPayload('not json')).toBeNull();
    expect(legacyPayload('{"state":{}}')).toBeNull();
  });
});
