import { describe, expect, it } from 'vitest';
import { clip, countChars } from './personaFiles';

describe('persona file limit', () => {
  it('counts one per character, an emoji included', () => {
    expect(countChars('abc')).toBe(3);
    expect(countChars('a😀b')).toBe(3); // two UTF-16 units, one character
  });

  it('never lets a text go past its limit, and never cuts an emoji in half', () => {
    expect(clip('abcdef', 4)).toBe('abcd');
    expect(clip('ab', 4)).toBe('ab');
    expect(clip('a😀😀b', 3)).toBe('a😀😀');
  });
});
