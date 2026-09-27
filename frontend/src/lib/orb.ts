/**
 * The Nova orb is a small round emoji face. Pure maths only, no drawing.
 *
 * It does two things:
 *   1. while idle, its eyes look to the right and to the left, slowly;
 *   2. while Nova speaks, it looks straight ahead and blinks.
 */

/** Moves `current` toward `target` smoothly. Rises a little faster than it falls. */
export function easeEnergy(current: number, target: number, seconds: number): number {
  const rate = target > current ? 5 : 2.2;
  const step = 1 - Math.exp(-rate * Math.max(0, seconds));
  return current + (target - current) * step;
}

// How long each look lasts, in seconds. Change these to tune the rhythm.
export const CENTER_HOLD = 1.5;
export const RIGHT_HOLD = 3;
export const LEFT_HOLD = 3;
export const TURN = 0.7;

/** [time, direction] pairs: 0 = straight ahead, 1 = right, -1 = left. */
const LOOK_KEYS: Array<[number, number]> = (() => {
  const keys: Array<[number, number]> = [[0, 0]];
  let t = 0;
  const go = (length: number, direction: number) => {
    t += length;
    keys.push([t, direction]);
  };
  go(CENTER_HOLD, 0);
  go(TURN, 1);
  go(RIGHT_HOLD, 1);
  go(TURN, 0);
  go(CENTER_HOLD, 0);
  go(TURN, -1);
  go(LEFT_HOLD, -1);
  go(TURN, 0);
  return keys;
})();

/** Seconds for one full look-around (right, then left). */
export const LOOK_PERIOD = LOOK_KEYS[LOOK_KEYS.length - 1][0];

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Where the eyes look at `seconds`: -1 (fully left) to 1 (fully right).
 * While speaking (`energy` near 1) they look straight ahead.
 */
export function lookDirection(seconds: number, energy = 0): number {
  const t = ((seconds % LOOK_PERIOD) + LOOK_PERIOD) % LOOK_PERIOD;
  let direction = 0;
  for (let i = 1; i < LOOK_KEYS.length; i++) {
    const [t1, v1] = LOOK_KEYS[i];
    const [t0, v0] = LOOK_KEYS[i - 1];
    if (t <= t1) {
      direction = v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
      break;
    }
  }
  return direction * (1 - Math.min(1, Math.max(0, energy)));
}

/** Seconds between blinks while speaking, and how long one blink lasts. */
export const BLINK_EVERY = 0.9;
export const BLINK_LENGTH = 0.2;

/**
 * How open the eyes are: 1 = open, 0 = shut. They only blink while speaking
 * (`energy` near 1), and a little faster when the voice is loud.
 */
export function eyeOpenness(seconds: number, energy: number, voiceLevel = 0): number {
  const e = Math.min(1, Math.max(0, energy));
  if (e < 0.15) return 1;
  const every = BLINK_EVERY - 0.25 * Math.min(1, Math.max(0, voiceLevel));
  const into = (((seconds % every) + every) % every) / BLINK_LENGTH;
  if (into >= 1) return 1;
  const closed = Math.sin(Math.PI * into) ** 2; // 0 -> 1 -> 0 during the blink
  const strength = Math.min(1, (e - 0.15) / 0.5);
  return 1 - closed * strength;
}

/** Proportions of the face (taken from the reference emoji). */
export const FACE = {
  /** Radius of the ball as a fraction of the drawing box. */
  radius: 0.3,
  /** The rest are fractions of the ball radius. */
  eyeSpacing: 0.37,
  eyeWidth: 0.19,
  eyeHeight: 0.43,
  eyeLift: 0.08,
  /** How far the eyes slide when looking fully to one side. */
  lookRange: 0.22,
  /** Shortest an eye gets when shut (a thin line). */
  shutHeight: 0.08,
};
