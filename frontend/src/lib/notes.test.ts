import { describe, expect, it } from 'vitest';
import { mentionedNoteId, plainSnippet, tidyMarkdown, whenText, withoutTitle } from './notes';

describe('withoutTitle', () => {
  it('drops the heading that repeats the title', () => {
    expect(withoutTitle('# Beachhead\n\nStart small.', 'Beachhead')).toBe('Start small.');
  });
  it('keeps a different first heading and a body without one', () => {
    expect(withoutTitle('# Other\ntext', 'Beachhead')).toBe('# Other\ntext');
    expect(withoutTitle('text only', 'Beachhead')).toBe('text only');
  });
});

describe('tidyMarkdown', () => {
  it('moves a space that sits inside the bold marks to the outside', () => {
    expect(tidyMarkdown('**Para aplicar, **não entregue')).toBe('**Para aplicar,** não entregue');
    expect(tidyMarkdown('texto** negrito**')).toBe('texto **negrito**');
  });
  it('leaves good bold alone', () => {
    expect(tidyMarkdown('a **bold** b and **also** c')).toBe('a **bold** b and **also** c');
  });
});

describe('whenText', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0);
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 9, 0, 0).getTime() / 1000;
  it('speaks in days for the last week, then a date', () => {
    expect(whenText(at(2026, 10, 15), now)).toBe('Today');
    expect(whenText(at(2026, 10, 14), now)).toBe('Yesterday');
    expect(whenText(at(2026, 10, 12), now)).toBe('3 Days Ago');
    expect(whenText(at(2026, 9, 8), now)).toBe('Oct 8, 2026');
  });
});

describe('plainSnippet', () => {
  it('is one plain line, shortened', () => {
    const out = plainSnippet('# T\n\n**Bold** and ![img](http://x/y.png) text', 'T');
    expect(out).toBe('Bold and text');
    expect(plainSnippet('x'.repeat(300), 'T', 20)).toHaveLength(21);
  });
});

describe('mentionedNoteId', () => {
  it('reads the id of a note link and ignores everything else', () => {
    const id = 'a'.repeat(32);
    expect(mentionedNoteId(`/notes?note=${id}`)).toBe(id);
    expect(mentionedNoteId('https://x.test/notes?note=' + id)).toBeNull();
    expect(mentionedNoteId(undefined)).toBeNull();
  });
});
