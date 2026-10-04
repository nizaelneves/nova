/**
 * Pure double-clap pattern detection — no Web Audio here, so it's testable
 * without a real microphone. A caller feeds it a volume sample (0-255) and a
 * timestamp (ms) on every animation frame; `feed()` returns `true` exactly
 * once, on the sample that completes a double-clap.
 *
 * Detection is relative, not a fixed volume cutoff: a rolling "noise floor"
 * tracks the room's ambient level, and a clap is a sample that jumps well
 * above that floor — both in absolute terms (so dead silence doesn't count
 * a tiny flicker as a clap) and in relative terms (so a soft clap in a quiet
 * room still registers, and normal background noise in a louder room
 * doesn't). A fixed threshold can't do both at once: calibrated for a quiet
 * room it mistriggers in a noisy one, and calibrated for a noisy room it
 * misses soft claps in a quiet one.
 *
 * A "clap" is a rising edge from the floor to a peak. Two claps count as a
 * double-clap when the gap between them is long enough to be two distinct
 * sounds (not one continuous loud noise) but short enough to be a single
 * deliberate gesture — generously wide, since real double-claps vary a lot
 * in rhythm (fast, slow, uneven). A cooldown after a trigger stops one
 * double-clap from also reading as the start of another.
 */

export interface ClapDetectorOptions {
  /** Minimum gap above the floor (0-255 scale) to ever count as a clap,
   * regardless of how quiet the room is — stops floor-level hiss from
   * ever registering as a "peak" relative to itself. */
  minAbsoluteJump: number;
  /** A sample counts as a clap when it's at least this many times the
   * current floor (e.g. 1.6 = 60% louder than ambient). */
  floorMultiplier: number;
  /** Minimum jump from the *immediately preceding* sample (not the slow-
   * moving floor) for a loud sample to count as a clap's sudden attack.
   * A fan spinning up or a voice rising still climbs above the floor
   * eventually, but frame-to-frame it grows gradually; a clap jumps this
   * much in a single ~16ms frame. This is what tells the two apart. */
  minAttackJump: number;
  /** How fast the floor adapts to the room's ambient level (0-1 per
   * sample; smaller = slower, so a clap's own peak can't drag the floor
   * up and mask the second clap). */
  floorAdaptRate: number;
  /** Minimum ms between two peaks for them to count as separate claps. */
  minGapMs: number;
  /** Maximum ms between two peaks for them to still count as one gesture. */
  maxGapMs: number;
  /** Ms to ignore new peaks after a trigger, so one gesture fires once. */
  cooldownMs: number;
}

export const DEFAULT_CLAP_OPTIONS: ClapDetectorOptions = {
  minAbsoluteJump: 18,
  floorMultiplier: 1.6,
  minAttackJump: 35,
  floorAdaptRate: 0.02,
  minGapMs: 50,
  // Wide on purpose: real double-claps range from quick taps to a lazy
  // clap-...-clap, and the user should never have to "perform" a specific
  // rhythm for it to register.
  maxGapMs: 1200,
  cooldownMs: 1500,
};

export class ClapPatternTracker {
  private floor: number;
  private lastVolume: number;
  private lastPeakAt: number | null = null;
  private lastTriggerAt = -Infinity;
  private wasLoud = false;

  constructor(private readonly opts: ClapDetectorOptions = DEFAULT_CLAP_OPTIONS, initialFloor = 0) {
    this.floor = initialFloor;
    this.lastVolume = initialFloor;
  }

  /** Feed one volume sample at timestamp `now` (ms, same clock throughout).
   * Returns `true` exactly on the sample that completes a double-clap. */
  feed(volume: number, now: number): boolean {
    const aboveFloor = volume >= this.floor + this.opts.minAbsoluteJump && volume >= this.floor * this.opts.floorMultiplier;
    const suddenAttack = volume - this.lastVolume >= this.opts.minAttackJump;
    const isPeak = aboveFloor && suddenAttack;
    this.lastVolume = volume;
    let triggered = false;

    if (isPeak && !this.wasLoud) {
      // Rising edge: a new peak just started.
      if (this.lastPeakAt === null) {
        this.lastPeakAt = now;
      } else {
        const gap = now - this.lastPeakAt;
        const cooledDown = now - this.lastTriggerAt > this.opts.cooldownMs;
        if (gap >= this.opts.minGapMs && gap <= this.opts.maxGapMs && cooledDown) {
          triggered = true;
          this.lastTriggerAt = now;
          this.lastPeakAt = null;
        } else {
          // Too close together (same clap's echo) or too far apart — this
          // peak becomes the new "first clap" candidate either way.
          this.lastPeakAt = now;
        }
      }
    }

    if (this.lastPeakAt !== null && now - this.lastPeakAt > this.opts.maxGapMs) {
      this.lastPeakAt = null;
    }

    // Only let quiet/normal samples pull the floor toward the room's real
    // ambient level — a clap's own loud sample must never raise the floor,
    // or a soft second clap right after a loud first one would be missed.
    if (!isPeak) {
      this.floor += (volume - this.floor) * this.opts.floorAdaptRate;
    }

    this.wasLoud = isPeak;
    return triggered;
  }

  reset(): void {
    this.lastPeakAt = null;
    this.wasLoud = false;
  }
}

/** Peak amplitude deviation from silence (128) in a time-domain byte buffer,
 * scaled to roughly 0-255 — the single number `ClapPatternTracker` wants. */
export function peakVolume(timeDomainData: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const dev = Math.abs(timeDomainData[i] - 128);
    if (dev > peak) peak = dev;
  }
  return Math.min(255, peak * 2);
}
