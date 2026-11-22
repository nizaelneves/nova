import { useState } from 'react';

/**
 * One pill with the current choice and an arrow; a click moves to the next choice (no list), and the right mouse
 * button, Shift+click or the left arrow key go back. With a `label` it sits under that label like the other fields.
 */
export function Cycler<T extends string>({ label, ariaLabel, value, options, onChange, placeholder, error, className = '' }: {
  label?: string;
  ariaLabel?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** Shown while `value` is none of the options; the first click then picks the first option. */
  placeholder?: string;
  error?: string;
  className?: string;
}) {
  const at = options.findIndex((o) => o.value === value);
  const [moved, setMoved] = useState(0); // changes on every step, so the new text slides in again
  const go = (d: number) => {
    if (!options.length) return;
    onChange(options[at < 0 ? (d > 0 ? 0 : options.length - 1) : (at + d + options.length) % options.length].value);
    setMoved((n) => n + 1);
  };
  const text = at >= 0 ? options[at].label : placeholder ?? '';
  const name = label ?? ariaLabel ?? '';
  return (
    <div className={`fin-field ${className}`}>
      {label && <span>{label}</span>}
      <button type="button" className="cyc-btn" aria-label={`${name}: ${text}. Click for the next one`}
        onClick={(e) => go(e.shiftKey ? -1 : 1)}
        onContextMenu={(e) => { e.preventDefault(); go(-1); }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } }}>
        <b key={moved} className="cyc-val">{text}</b>
        <svg className="cyc-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      {error && <em role="alert">{error}</em>}
    </div>
  );
}
