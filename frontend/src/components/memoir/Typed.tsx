import { useEffect, useState } from 'react';

/** A placeholder typed out one letter at a time, with a blinking bar (the typewriter effect). */
export function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setN(n + 1), n === 0 ? 250 : 26);
    return () => clearTimeout(id);
  }, [n, text]);
  return <span className="mm-typed" aria-hidden="true">{text.slice(0, n)}<i /></span>;
}
