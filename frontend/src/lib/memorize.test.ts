import { describe, expect, it } from 'vitest';

import {
  EMPTY_MEMORIZE,
  addItem,
  parseMemorize,
  removeItem,
  toggleCategory,
  type MemorizeData,
} from './memorize';

const NOW = new Date('2026-10-04T12:00:00Z');

describe('toggleCategory', () => {
  it('turns a category on, then off again', () => {
    const on = toggleCategory(EMPTY_MEMORIZE, 'bible');
    expect(on.enabled).toEqual(['bible']);
    expect(toggleCategory(on, 'bible').enabled).toEqual([]);
  });
});

describe('addItem', () => {
  const enabled: MemorizeData = { enabled: ['bible'], items: [] };

  it('adds a trimmed item to an enabled category, newest first', () => {
    const once = addItem(enabled, { category: 'bible', text: '  Salmos 23  ', source: ' ARA ' }, NOW);
    const twice = addItem(once, { category: 'bible', text: 'João 3:16' }, NOW);

    expect(twice.items.map((i) => i.text)).toEqual(['João 3:16', 'Salmos 23']);
    expect(once.items[0]).toMatchObject({ source: 'ARA', createdAt: NOW.toISOString() });
    expect(new Set(twice.items.map((i) => i.id)).size).toBe(2);
  });

  it('ignores blank text and categories that are switched off', () => {
    expect(addItem(enabled, { category: 'bible', text: '   ' }, NOW)).toBe(enabled);
    expect(addItem(enabled, { category: 'quotes', text: 'Carpe diem' }, NOW)).toBe(enabled);
  });
});

describe('removeItem', () => {
  it('removes only the chosen item', () => {
    const data = addItem(
      addItem({ enabled: ['ideas'], items: [] }, { category: 'ideas', text: 'a' }, NOW),
      { category: 'ideas', text: 'b' },
      NOW,
    );
    const [first, second] = data.items;
    expect(removeItem(data, first.id).items).toEqual([second]);
  });
});

describe('parseMemorize', () => {
  it('starts empty with nothing stored or with garbage', () => {
    expect(parseMemorize(null)).toEqual(EMPTY_MEMORIZE);
    expect(parseMemorize('not json')).toEqual(EMPTY_MEMORIZE);
  });

  it('drops unknown categories, duplicates and malformed items', () => {
    const raw = JSON.stringify({
      enabled: ['bible', 'bible', 'astrology', 3],
      items: [
        { id: '1', category: 'bible', text: 'ok', source: '', createdAt: 'x' },
        { id: '2', category: 'astrology', text: 'nope', source: '', createdAt: 'x' },
        { id: '3', category: 'quotes', text: '   ', source: '', createdAt: 'x' },
        null,
      ],
    });
    const data = parseMemorize(raw);

    expect(data.enabled).toEqual(['bible']);
    expect(data.items.map((i) => i.id)).toEqual(['1']);
  });
});
