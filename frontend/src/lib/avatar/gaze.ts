/**
 * Where the eyes look, from the cursor's offset (in pixels) to the middle of the face.
 * The direction is exact, so the eyes point at the cursor at any angle; the amount grows with
 * distance and reaches the full turn at about 260 px. Result is a vector of length 0 to 1.
 */
export function gazeToward(dx: number, dy: number): [number, number] {
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return [0, 0];
  const amount = Math.min(1, (dist / 260) ** 0.75);
  return [(dx / dist) * amount, (dy / dist) * amount];
}
