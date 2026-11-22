import { useState } from 'react';

/**
 * A Source field that completes itself like the Finances description: only the single most likely name shows,
 * greyed after what you typed. Tab, Enter or the right arrow takes it. `options` come most used first.
 */
export function SourceInput({ value, onChange, options, disabled, autoFocus }: { value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; autoFocus?: boolean }) {
  const [focus, setFocus] = useState(false);
  const typed = value.trimStart().toLowerCase();
  const guess = focus && typed ? options.find((o) => o.toLowerCase().startsWith(typed) && o.toLowerCase() !== value.trim().toLowerCase()) : undefined;
  const ghost = guess ? guess.slice(value.trimStart().length) : '';
  return (
    <div className="mm-sg-wrap">
      <input value={value} autoComplete="off" disabled={disabled} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onKeyDown={(e) => {
          if (!guess) return;
          const atEnd = e.currentTarget.selectionStart === value.length;
          if (e.key === 'Tab' || e.key === 'Enter' || (e.key === 'ArrowRight' && atEnd)) { e.preventDefault(); e.stopPropagation(); onChange(guess); }
        }} />
      {guess && ghost && <span className="mm-sg-ghost" aria-hidden="true"><i>{value}</i>{ghost}</span>}
    </div>
  );
}
