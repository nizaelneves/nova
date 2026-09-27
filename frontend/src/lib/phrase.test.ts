import { describe, expect, it } from 'vitest';
import { cleanPhrase } from './phrase';

describe('cleanPhrase', () => {
  it('removes quotes typed around the phrase', () => {
    expect(cleanPhrase('"Um passo de cada vez."')).toBe('Um passo de cada vez.');
    expect(cleanPhrase(' “Keep going” ')).toBe('Keep going');
  });
  it('keeps quotes and apostrophes inside the phrase', () => {
    expect(cleanPhrase("Don't stop \"now\" ok")).toBe("Don't stop \"now\" ok");
  });
});
