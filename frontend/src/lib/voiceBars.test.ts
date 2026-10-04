import { describe, expect, it } from 'vitest';

import { REST_HEIGHT, barHeights, envelope } from './voiceBars';

describe('envelope', () => {
  it('is highest in the middle and lowest at the edges', () => {
    expect(envelope(24, 49)).toBeGreaterThan(envelope(12, 49));
    expect(envelope(12, 49)).toBeGreaterThan(envelope(0, 49));
    expect(envelope(0, 49)).toBeCloseTo(envelope(48, 49));
  });

  it('copes with a single bar', () => {
    expect(envelope(0, 1)).toBe(1);
  });
});

describe('barHeights', () => {
  it('returns one height per bar, all within range', () => {
    const heights = barHeights(48, 0.8, 1.3);

    expect(heights).toHaveLength(48);
    expect(heights.every((h) => h >= REST_HEIGHT && h <= 1)).toBe(true);
  });

  it('leaves every bar resting in silence', () => {
    expect(barHeights(20, 0, 5).every((h) => h === REST_HEIGHT)).toBe(true);
  });

  it('rises with the voice level', () => {
    const quiet = barHeights(48, 0.1, 2).reduce((a, b) => a + b, 0);
    const loud = barHeights(48, 0.9, 2).reduce((a, b) => a + b, 0);

    expect(loud).toBeGreaterThan(quiet);
  });

  it('keeps moving over time, so it reads as a waveform', () => {
    expect(barHeights(48, 0.7, 1)).not.toEqual(barHeights(48, 0.7, 1.4));
  });

  it('clamps a level outside 0 to 1', () => {
    expect(barHeights(10, 5, 1).every((h) => h <= 1)).toBe(true);
    expect(barHeights(10, -2, 1).every((h) => h === REST_HEIGHT)).toBe(true);
  });
});
