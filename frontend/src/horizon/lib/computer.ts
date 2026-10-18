/** Formatting for the Computer widget. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 -> "1.5 KB"; one decimal below 10, none from 100 up. */
export function bytes(n: number): string {
  let value = Math.max(0, n);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
}

export const speed = (bytesPerSecond: number): string => `${bytes(bytesPerSecond)}/s`;

/** 93784 seconds -> "1d 2h"; 4000 -> "1h 6m"; 90 -> "1m". */
export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86_400), h = Math.floor((seconds % 86_400) / 3600), m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/** The last `limit` readings, oldest first. */
export const push = (history: number[], value: number, limit = 40): number[] => [...history, value].slice(-limit);

/** Points for an SVG line over a history, scaled to `max` (or to the highest reading when no maximum is given). */
export function sparkline(history: number[], width: number, height: number, max?: number): string {
  if (history.length < 2) return '';
  const top = max ?? Math.max(...history, 1);
  return history.map((v, i) => `${((i / (history.length - 1)) * width).toFixed(1)},${(height - Math.min(1, v / top) * height).toFixed(1)}`).join(' ');
}

export const percent = (used: number, total: number): number => (total > 0 ? Math.min(100, (used / total) * 100) : 0);
