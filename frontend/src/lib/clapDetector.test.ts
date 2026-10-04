import { describe, expect, it } from 'vitest';
import { ClapPatternTracker, DEFAULT_CLAP_OPTIONS, peakVolume } from './clapDetector';

describe('ClapPatternTracker', () => {
  it('triggers on two loud peaks within the gap window, from a quiet floor', () => {
    const t = new ClapPatternTracker();
    expect(t.feed(5, 0)).toBe(false); // ambient quiet establishes the floor
    expect(t.feed(120, 10)).toBe(false); // clap 1
    expect(t.feed(5, 50)).toBe(false); // silence between claps
    expect(t.feed(120, 300)).toBe(true); // clap 2 — within the gap window
  });

  it('registers a soft clap in a quiet room (relative jump, not an absolute level)', () => {
    const t = new ClapPatternTracker();
    t.feed(2, 0);
    expect(t.feed(40, 10)).toBe(false); // a soft clap — far below any fixed "loud" cutoff
    t.feed(2, 50);
    expect(t.feed(40, 300)).toBe(true);
  });

  it('does not mistrigger on steady background noise once the floor is calibrated to it', () => {
    // A noisier room: the floor starts pre-calibrated to its ambient hum
    // (as the real hook does with a short calibration pass on start — see
    // useClapToActivate), so steady noise at that level never looks like a
    // rising edge.
    const t = new ClapPatternTracker(DEFAULT_CLAP_OPTIONS, 60);
    for (let ms = 0; ms <= 2000; ms += 20) {
      expect(t.feed(60, ms)).toBe(false);
    }
  });

  it('a clap over louder ambient noise still registers above the calibrated floor', () => {
    const t = new ClapPatternTracker(DEFAULT_CLAP_OPTIONS, 60);
    expect(t.feed(110, 20)).toBe(false); // clap 1, clearly above the calibrated floor
    t.feed(60, 40);
    expect(t.feed(110, 300)).toBe(true); // clap 2
  });

  it('does not trigger on a single sustained loud sound', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    for (let ms = 10; ms <= 500; ms += 20) {
      expect(t.feed(150, ms)).toBe(false);
    }
  });

  it('does not trigger when the second peak is too close (same clap bouncing)', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    t.feed(120, 10);
    t.feed(5, 20);
    expect(t.feed(120, 30)).toBe(false); // gap 10ms < minGapMs (50ms)
  });

  it('accepts a slow, lazy double-clap within the wide gap window', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    t.feed(120, 10);
    t.feed(5, 500);
    expect(t.feed(120, 1100)).toBe(true); // ~1090ms apart — still within maxGapMs (1200ms)
  });

  it('does not trigger when the second peak is far too far away', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    t.feed(120, 10);
    t.feed(5, 50);
    expect(t.feed(120, 3000)).toBe(false);
  });

  it('treats a too-far second peak as a fresh first clap, not a dead end', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    t.feed(120, 10);
    t.feed(5, 50);
    t.feed(120, 3000); // too far from clap 1 — becomes the new clap 1
    t.feed(5, 3050);
    expect(t.feed(120, 3300)).toBe(true);
  });

  it('respects the cooldown after a trigger so a double-clap does not chain', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    t.feed(120, 10);
    t.feed(5, 50);
    expect(t.feed(120, 300)).toBe(true);
    t.feed(5, 350);
    // A third peak soon after would otherwise pair with the trigger peak.
    expect(t.feed(120, 600)).toBe(false);
  });

  it('only counts rising edges, not every loud sample while still loud', () => {
    const t = new ClapPatternTracker();
    t.feed(5, 0);
    t.feed(120, 10);
    t.feed(120, 20); // still loud — not a new peak
    t.feed(5, 50);
    expect(t.feed(120, 300)).toBe(true);
  });

  it('a clap never drags the floor up and masks the next one', () => {
    const t = new ClapPatternTracker(DEFAULT_CLAP_OPTIONS, 5);
    t.feed(5, 0);
    t.feed(200, 10); // a very loud first clap
    // If the floor tracked this, a normal second clap right after could be
    // missed; it should stay near the pre-clap ambient level instead.
    t.feed(5, 50);
    expect(t.feed(120, 300)).toBe(true);
  });

  it('ignores a gradual rise (a fan spinning up), even once it clears the floor', () => {
    const t = new ClapPatternTracker(DEFAULT_CLAP_OPTIONS, 10);
    // Each step is a small increment — never a sudden jump — even though the
    // final level is well above the floor by the usual relative/absolute test.
    let triggered = false;
    for (let v = 10, ms = 0; v <= 80; v += 4, ms += 20) {
      if (t.feed(v, ms)) triggered = true;
    }
    expect(triggered).toBe(false);
  });

  it('still catches a real clap that happens to land on an already-elevated level', () => {
    const t = new ClapPatternTracker(DEFAULT_CLAP_OPTIONS, 10);
    let lastMs = 0;
    for (let v = 10, ms = 0; v <= 80; v += 4, ms += 20) { t.feed(v, ms); lastMs = ms; } // the fan ramp
    expect(t.feed(150, lastMs + 20)).toBe(false); // a sudden clap right after the ramp — clap 1
    t.feed(10, lastMs + 70);
    expect(t.feed(150, lastMs + 320)).toBe(true); // clap 2
  });

  it('default options tolerate both quick and lazy double-claps', () => {
    expect(DEFAULT_CLAP_OPTIONS.minGapMs).toBeLessThan(200);
    expect(DEFAULT_CLAP_OPTIONS.maxGapMs).toBeGreaterThanOrEqual(1000);
  });
});

describe('peakVolume', () => {
  it('reads 0 for silence (all samples at the 128 midpoint)', () => {
    expect(peakVolume(new Uint8Array([128, 128, 128]))).toBe(0);
  });

  it('reads the largest deviation from the midpoint, scaled up', () => {
    expect(peakVolume(new Uint8Array([128, 180, 128]))).toBe(104); // |180-128|*2
  });

  it('clamps at 255', () => {
    expect(peakVolume(new Uint8Array([0, 255]))).toBe(255);
  });
});
