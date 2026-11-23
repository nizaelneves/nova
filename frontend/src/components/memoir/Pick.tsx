import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';

export interface PickOption { value: string; label: string }

/** A dropdown in Memoir's own look, in place of the browser's <select>: a pill, and a menu like the sort menu. */
export function Pick({ value, options, onChange, placeholder = '', label, disabled, className = '' }: {
  value: string; options: PickOption[]; onChange: (value: string) => void; placeholder?: string; label?: string; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false); // not enough room below: open upwards
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const now = options.find((o) => o.value === value);
  return (
    <span className={`mm-dd ${className}`} ref={box}>
      <button type="button" className="mm-dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} disabled={disabled} data-empty={!now} onClick={() => { const r = box.current?.getBoundingClientRect(); if (r) setUp(window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom); setOpen((o) => !o); }}>
        <span className="truncate">{now?.label ?? placeholder}</span><Icon name="alt-arrow-down" size={14} />
      </button>
      {open && (
        <div className="mm-dd-menu" role="listbox" data-up={up}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} data-on={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
              <span className="truncate">{o.label}</span>{o.value === value && <Icon name="check-circle" size={14} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
