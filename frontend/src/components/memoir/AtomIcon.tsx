/** Memoir's atom: three orbits that turn slowly, a nucleus that breathes and an electron on each orbit. */
export function AtomIcon({ size = 22 }: { size?: number }) {
  const orbit = 'M3 12a9 3.6 0 1 0 18 0a9 3.6 0 1 0 -18 0';
  return (
    <svg className="mm-atom" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <g className="mm-atom-orbits">
        {[0, 60, 120].map((deg, i) => (
          <g key={deg} transform={`rotate(${deg} 12 12)`}>
            <path d={orbit} />
            <circle r="1.15" fill="currentColor" stroke="none">
              <animateMotion dur={`${3 + i * 0.7}s`} repeatCount="indefinite" path={orbit} />
            </circle>
          </g>
        ))}
      </g>
      <circle className="mm-atom-core" cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
