/** Phibe's rhythm: durations and delays are Fibonacci numbers, in milliseconds. */
export const FIB_MS = [89, 144, 233, 377, 610, 987] as const;

/** Delay for item *i* of a list, so rows arrive one after another: 0, 89, 144, 233, 377, 610 (then it stops growing). */
export const fibStagger = (i: number): number => (i === 0 ? 0 : FIB_MS[Math.min(i - 1, FIB_MS.length - 2)]);

/** Props for a list item that rises in with the Fibonacci stagger (see `.fib-in` in index.css). */
export const fibIn = (i: number): { className: string; style: React.CSSProperties } => ({
  className: 'fib-in',
  style: { ['--fib-delay' as string]: `${fibStagger(i)}ms` },
});
