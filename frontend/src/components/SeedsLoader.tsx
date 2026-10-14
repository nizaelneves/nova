// The sunflower dots (golden angle), pulsing one after another, in place of "Loading…".
const DOTS = Array.from({ length: 13 }, (_, i) => {
  const r = 2.4 * Math.sqrt(i + 1);
  const a = (i + 1) * Math.PI * (3 - Math.sqrt(5));
  return { x: 12 + r * Math.cos(a), y: 12 + r * Math.sin(a), r: 0.8 + i * 0.06 };
});

export function SeedsLoader({ size = 36 }: { size?: number }) {
  return (
    <div className="seeds-loader" role="status" aria-label="Loading">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        {DOTS.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} style={{ animationDelay: `${i * 89}ms` }} />
        ))}
      </svg>
    </div>
  );
}
