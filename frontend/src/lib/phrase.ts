/** Removes quote marks typed around a phrase; the screen adds the curly ones itself. */
export function cleanPhrase(text: string): string {
  return text.trim().replace(/^["“”«»]+/, '').replace(/["“”«»]+$/, '').trim();
}

/** A small, stable hash: same bucket in -> same number out, spread evenly. */
function hashBucket(bucket: number): number {
  let hash = bucket | 0;
  hash = ((hash << 13) ^ hash) >>> 0;
  hash = (hash * 0x27d4eb2d) >>> 0;
  return (hash ^ (hash >>> 15)) >>> 0;
}

/**
 * Which phrase (0..count-1) to show right now.
 *
 * Every `rotationMinutes` the clock moves into a new "bucket", and everyone
 * opening the home during that window sees the same phrase — no state
 * needed, it falls out of the clock. When it moves to the next bucket, a
 * different phrase (still picked by the same rule) may come up.
 */
export function pickPhraseIndex(
  count: number,
  rotationMinutes: number,
  now: Date = new Date(),
): number {
  if (count <= 0) return 0;
  const bucket = Math.floor(now.getTime() / (rotationMinutes * 60_000));
  return hashBucket(bucket) % count;
}
