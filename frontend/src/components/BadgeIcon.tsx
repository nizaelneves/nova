export type BadgeGlyphKind =
  | 'approval'
  | 'question'
  | 'error'
  | 'done'
  | 'ping'
  | 'draft'
  | 'bang'
  | 'wave'
  | 'send'
  | 'micoff'
  | 'plug'
  | 'download';

const STROKE = { fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/**
 * The little white symbols that sit inside a badge (drawn for a 26 x 26 box centred on 0,0).
 * Shared by the floating button's badges and the voice card, so one symbol means one thing.
 */
export function BadgeGlyph({ kind }: { kind: BadgeGlyphKind }) {
  switch (kind) {
    case 'approval':
    case 'bang':
      return (
        <>
          <line x1="0" y1="-7" x2="0" y2="1.5" {...STROKE} strokeWidth={3} />
          <circle cx="0" cy="6" r="1.8" fill="#fff" />
        </>
      );
    case 'done':
      return <path d="M-5.5,0.5 L-1.8,4.3 L5.8,-4" {...STROKE} strokeWidth={3} />;
    case 'question':
      return (
        <text x="0" y="1" fontSize="13" fontWeight="800" fill="#fff" textAnchor="middle" dominantBaseline="central">
          ?
        </text>
      );
    case 'error':
      return <circle cx="0" cy="0" r="3.4" fill="#fff" />;
    case 'draft':
      return <path d="M-5,5.5 L-5,2.5 L3.5,-6 L6.5,-3 L-2,5.5 Z M1,-1.5 L4,1.5" {...STROKE} strokeWidth={1.9} />;
    case 'wave':
      return (
        <>
          {[4, 9, 14, 9, 4].map((h, i) => (
            <line key={i} x1={-8 + i * 4} y1={-h / 2} x2={-8 + i * 4} y2={h / 2} {...STROKE} />
          ))}
        </>
      );
    case 'send':
      return <path d="M-6,0 A6,6 0 1 1 0,6" {...STROKE} />;
    case 'micoff':
      return (
        <>
          <rect x="-2.6" y="-8" width="5.2" height="9" rx="2.6" {...STROKE} />
          <path d="M-6,-1 C-6,5 6,5 6,-1" {...STROKE} />
          <line x1="0" y1="5" x2="0" y2="8" {...STROKE} />
          <line x1="-8" y1="-8" x2="8" y2="8" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
        </>
      );
    case 'plug':
      return (
        <>
          <line x1="-3" y1="-8" x2="-3" y2="-3" {...STROKE} />
          <line x1="3" y1="-8" x2="3" y2="-3" {...STROKE} />
          <path d="M-6,-3 H6 V1 C6,4 3,6 0,6 C-3,6 -6,4 -6,1 Z" {...STROKE} />
          <line x1="0" y1="6" x2="0" y2="9" {...STROKE} />
        </>
      );
    case 'download':
      return (
        <>
          <line x1="0" y1="-8" x2="0" y2="3" {...STROKE} />
          <path d="M-4.5,-1.5 L0,3 L4.5,-1.5" {...STROKE} />
          <line x1="-6" y1="8" x2="6" y2="8" {...STROKE} />
        </>
      );
    default:
      // ping: a bell
      return <path d="M-4.5,3 H4.5 M-3.2,3 C-3.2,-4 3.2,-4 3.2,3 M-1.2,5.6 H1.2" {...STROKE} strokeWidth={2.2} />;
  }
}
