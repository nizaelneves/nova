import { useEffect, useState } from 'react';

const NUMBERS = /(R\$\s?[\d.]+,\d{2}|\d+%|\d+)/;

/** A summary sentence typed out like the island's terminal; numbers are coloured, the first by gain or loss when the text says so. */
export function TerminalLine({ text }: { text: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(text.length); return; }
    setShown(0);
    let n = 0;
    const t = window.setInterval(() => { n += 1; setShown(n); if (n >= text.length) window.clearInterval(t); }, 18);
    return () => window.clearInterval(t);
  }, [text]);

  let first = true;
  let used = 0;
  const parts = text.split(NUMBERS).map((part, i) => {
    const visible = part.slice(0, Math.max(0, shown - used));
    used += part.length;
    if (!visible) return null;
    if (i % 2 === 0) return visible;
    const tone = first ? (text.includes('ahead') ? 'up' : text.includes('over what') ? 'down' : 'num') : 'num';
    first = false;
    return <b key={i} className={`fin-num fin-num-${tone}`}>{visible}</b>;
  });

  return (
    <p className="fin-line" aria-label={text}>
      <span aria-hidden="true">❯</span>
      <span aria-hidden="true">{parts}<i className="tm-cursor" /></span>
    </p>
  );
}
