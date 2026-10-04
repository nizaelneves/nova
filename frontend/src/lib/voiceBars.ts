/**
 * Heights for the voice visualizer's bars. Pure maths only, no drawing.
 *
 * Every bar is fed by the same loudness (the voice's level, 0 to 1), shaped by
 * a bell-like envelope so the middle bars rise most, and wobbled by its own
 * slow sine so the row moves like a waveform instead of pumping in unison.
 */

/** How tall the quiet resting bars are, as a share of the full height. */
export const REST_HEIGHT = 0.06;

/** Bell-shaped weight for bar `index` of `count`: 1 in the middle, lower at the edges. */
export function envelope(index: number, count: number): number {
  if (count <= 1) return 1;
  const fromCentre = Math.abs((2 * index) / (count - 1) - 1); // 0 in the middle, 1 at the edges
  return 0.3 + 0.7 * (1 - fromCentre ** 1.6);
}

/**
 * Bar heights from 0 to 1 at `seconds`, for a voice at `level` (0 to 1).
 * Silence leaves every bar at the resting height.
 */
export function barHeights(count: number, level: number, seconds: number): number[] {
  const loud = Math.min(1, Math.max(0, level));
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const wobble = 0.5 + 0.5 * Math.sin(seconds * (5 + (i % 7) * 0.9) + i * 1.7);
    const lift = loud * envelope(i, count) * (0.35 + 0.65 * wobble);
    heights.push(Math.min(1, REST_HEIGHT + lift * (1 - REST_HEIGHT)));
  }
  return heights;
}
