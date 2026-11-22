import type { CardBrandId } from '../../lib/finance/model';

/** The mark of a card brand, drawn small in white tones, for the corner of a card. */
export function CardBrand({ brand, height = 30 }: { brand?: CardBrandId | null; height?: number }) {
  if (!brand) return null;
  if (brand === 'mastercard') {
    return (
      <svg viewBox="0 0 48 30" height={height} role="img" aria-label="Mastercard">
        <circle cx="17" cy="15" r="13" fill="#eb001b" />
        <circle cx="31" cy="15" r="13" fill="#f79e1b" fillOpacity=".92" />
        <path d="M24 4.6a13 13 0 0 1 0 20.8 13 13 0 0 1 0-20.8Z" fill="#ff5f00" />
      </svg>
    );
  }
  const text: Record<Exclude<CardBrandId, 'mastercard'>, { t: string; style: React.CSSProperties }> = {
    visa: { t: 'VISA', style: { fontStyle: 'italic', fontWeight: 900, letterSpacing: '0.04em', color: '#dfe7ff' } },
    elo: { t: 'elo', style: { fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } },
    amex: { t: 'AMEX', style: { fontWeight: 800, letterSpacing: '0.1em', color: '#9fd0ff' } },
    hipercard: { t: 'Hipercard', style: { fontWeight: 800, letterSpacing: '-0.01em', color: '#ff8e8e' } },
  };
  const m = text[brand];
  return <span style={{ ...m.style, fontSize: height * 0.8, lineHeight: 1, fontFamily: 'system-ui, sans-serif' }} aria-label={brand}>{m.t}</span>;
}
