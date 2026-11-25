import { describe, expect, it } from 'vitest';

import { setIdleSeconds, touch } from '../lib/phibeActivity';
import { createIdleLife, type Pose } from './phibeIdleLife';

/** Runs the life for `seconds` at 20 frames a second and returns every pose. */
function run(life: ReturnType<typeof createIdleLife>, seconds: number, idleStart: number, music = false, enabled = true): Pose[] {
  const poses: Pose[] = [];
  for (let t = 0; t < seconds; t += 0.05) poses.push({ ...life.update(0.05, { idle: idleStart + t, music, enabled, px: 180, py: 140 }) });
  return poses;
}

describe("Phibe's life when you are away", () => {
  it('does nothing while you are around, or when she is busy with something else', () => {
    const a = run(createIdleLife(), 5, 0);
    expect(a.every((p) => !p.takeGaze && p.lid === 0 && p.mist === 1 && p.crescent === 0)).toBe(true);
    const busy = run(createIdleLife(), 30, 20, true, false);
    expect(busy.every((p) => !p.takeGaze && p.crescent === 0 && p.sparkle === 0)).toBe(true);
  });

  it('looks around by herself when she has been alone a while, and never hums or dances without music', () => {
    const poses = run(createIdleLife(), 50, 10);
    expect(poses.some((p) => p.takeGaze)).toBe(true);
    expect(poses.some((p) => Math.abs(p.gx) > 5)).toBe(true);
    expect(poses.every((p) => p.crescent === 0 && p.sparkle === 0)).toBe(true);
  });

  it('hums (a lit crescent in her eyes) or dances (glints) while music plays', () => {
    // She is only free to play between 8 and 60 seconds alone, so look at many tries.
    const poses = Array.from({ length: 30 }, () => run(createIdleLife(), 50, 10, true)).flat();
    expect(poses.some((p) => p.crescent > 0.5)).toBe(true);
    expect(poses.some((p) => p.sparkle > 0.5)).toBe(true);
  });

  it('gets sleepy, nods, and sleeps with her eyes closed; deep asleep the body is dust', () => {
    const sleepy = run(createIdleLife(), 20, 70);
    expect(Math.max(...sleepy.map((p) => p.lid))).toBeGreaterThan(0.3);
    expect(sleepy.every((p) => p.crescent === 0)).toBe(true);
    const asleep = run(createIdleLife(), 5, 100)[100 - 1];
    expect(asleep.lid).toBeGreaterThan(0.72);
    const deep = run(createIdleLife(), 5, 200)[100 - 1];
    expect(deep.mist).toBeLessThan(0.1);
    expect(deep.lid).toBeGreaterThan(0.72);
  });

  it('wakes from deep sleep with a lamp that takes three tries, then settles; from a light sleep she just opens her eyes', () => {
    const life = createIdleLife();
    setIdleSeconds(200);
    run(life, 2, 200);
    touch(); // you are back
    const wake = run(life, 7, 0); // the lamp ends before she has been alone long enough to start looking around again
    expect(wake[0].lid).toBeGreaterThan(0.9); // still asleep for a moment
    expect(wake.slice(0, 100).some((p) => p.mist > 0.2 && p.mist < 0.95)).toBe(true); // the lamp flickers
    const end = wake[wake.length - 1];
    expect(end.mist).toBe(1);
    expect(end.lid).toBe(0);
    expect(end.takeGaze).toBe(false);

    const light = createIdleLife();
    setIdleSeconds(70);
    run(light, 2, 70);
    touch();
    const quick = run(light, 3, 0);
    expect(quick[quick.length - 1].lid).toBe(0);
    expect(quick.some((p) => p.by < 0)).toBe(true); // a little hop
  });
});
