import { describe, expect, it } from 'vitest';
import { addNote, removeNote } from './projectNotes';

describe('workspace quick notes', () => {
  const now = new Date('2026-10-18T10:00:00Z');

  it('puts the newest note first and ignores an empty one', () => {
    const one = addNote([], '  Call the client  ', now);
    expect(one[0].text).toBe('Call the client');
    expect(addNote(one, '   ', now)).toBe(one);
    expect(addNote(one, 'Second', now).map((n) => n.text)).toEqual(['Second', 'Call the client']);
  });

  it('keeps only the newest fifty and can remove one', () => {
    let list = addNote([], 'first', now);
    for (let i = 0; i < 55; i++) list = addNote(list, `n${i}`, now);
    expect(list).toHaveLength(50);
    expect(list[0].text).toBe('n54');
    expect(removeNote(list, list[0].id)).toHaveLength(49);
  });
});
