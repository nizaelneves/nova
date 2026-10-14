/** Lines from Phibe's brand message (docs/design/BRAND-STORY.md); one is typed at random in the island. */
export const PHRASES = [
  'Haste is the enemy of perfection.',
  'Better 1% today than nothing.',
  'Just keep going.',
  'Consume what matters, keep evolving.',
  'Grows with you, one turn at a time.',
  'Small steps build on the last ones.',
  'Nothing starts from zero.',
  'One main thing first. Then two. Then three.',
  'Evolving means adding, not erasing.',
  'At your own pace.',
  'Take only the essentials.',
  'One more turn of the spiral.',
] as const;

/** A random phrase other than the one at `not` (so the same line never repeats back to back). */
export function nextPhrase(not = -1): number {
  let i = Math.floor(Math.random() * PHRASES.length);
  if (i === not) i = (i + 1) % PHRASES.length;
  return i;
}
