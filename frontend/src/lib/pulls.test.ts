import { describe, expect, it } from 'vitest';
import { applyLine, emptyProgress, labelOf, percentOf, sizeText } from './pulls';

describe('model download progress', () => {
  it('adds up the layers and counts a repeated layer once', () => {
    let p = emptyProgress();
    p = applyLine(p, { status: 'pulling manifest' });
    expect(percentOf(p)).toBe(0);
    expect(labelOf(p)).toBe('Preparing…');
    p = applyLine(p, { status: 'pulling a', digest: 'a', total: 800, completed: 200 });
    p = applyLine(p, { status: 'pulling b', digest: 'b', total: 200, completed: 0 });
    expect(percentOf(p)).toBe(20);
    p = applyLine(p, { status: 'pulling a', digest: 'a', total: 800, completed: 800 });
    expect(p.completed).toBe(800);
    expect(percentOf(p)).toBe(80);
    expect(labelOf(p)).toBe('Downloading…');
  });

  it('stays below 100 until the end and names the closing steps', () => {
    let p = applyLine(emptyProgress(), { digest: 'a', total: 10, completed: 10, status: 'pulling a' });
    expect(percentOf(p)).toBe(99);
    p = applyLine(p, { status: 'verifying sha256 digest' });
    expect(labelOf(p)).toBe('Verifying…');
    p = applyLine(p, { status: 'writing manifest' });
    expect(labelOf(p)).toBe('Finishing…');
  });

  it('writes sizes in MB or GB', () => {
    expect(sizeText(412_000_000)).toBe('412 MB');
    expect(sizeText(2_480_000_000)).toBe('2.5 GB');
  });
});
