/** The OpenJarvis mark: a thin-stroke bowtie/hourglass glyph. Purely decorative. */
export function BrandMark({ size = 24, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={glow ? 'jarvis-mark' : undefined}
    >
      <path
        d="M8 6 L24 16 L8 26 Z M24 6 L8 16 L24 26 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
