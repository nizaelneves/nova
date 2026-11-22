import { useEffect, useRef, useState } from 'react';
import { Popup } from '../Popup';
import { Icon } from '../Icon';
import type { Item, Option, Property, PropertyType, Value } from '../../lib/boards-api';

export const TYPE_LABEL: Record<PropertyType, string> = {
  text: 'Text', number: 'Number', checkbox: 'Checkbox', date: 'Date', select: 'Select', status: 'Status', tags: 'Tags',
};
const PALETTE = ['#8b93a7', '#3e8fe0', '#d9a441', '#1fae7a', '#e5484d', '#a78bfa', '#ec7fb4', '#2bb5b8'];
export const nextColor = (n: number) => PALETTE[n % PALETTE.length];

/** Open/close state for a small menu that closes on an outside click or Escape. */
function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  return { open, setOpen, ref };
}

/** A status/select cell: a coloured pill that opens the property's options. */
function OptionCell({ prop, value, onChange, onEdit }: { prop: Property; value: Value | undefined; onChange: (v: Value) => void; onEdit: () => void }) {
  const { open, setOpen, ref } = usePop();
  const current = prop.options.find((o) => o.id === value);
  return (
    <div ref={ref} className="tt-pillwrap">
      <button type="button" className="tt-pill" style={{ background: current?.color ?? 'transparent', color: current ? '#fff' : 'var(--color-text-tertiary)', border: current ? 0 : '1px dashed var(--color-border)' }}
        aria-haspopup="listbox" aria-expanded={open} aria-label={`${prop.name}: ${current?.label ?? 'empty'}`} onClick={() => setOpen(!open)}>
        {current?.label ?? '—'}
      </button>
      {open && (
        <div className="tt-menu" role="listbox" aria-label={prop.name}>
          {prop.options.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === value} className="tt-pill" style={{ background: o.color }} onClick={() => { setOpen(false); onChange(o.id); }}>{o.label}</button>
          ))}
          {prop.type === 'select' && value != null && <button type="button" className="bd-link" onClick={() => { setOpen(false); onChange(null); }}>Clear</button>}
          <button type="button" className="bd-link" onClick={() => { setOpen(false); onEdit(); }}>Edit options…</button>
        </div>
      )}
    </div>
  );
}

function TagsCell({ prop, value, onChange, onEdit }: { prop: Property; value: Value | undefined; onChange: (v: Value) => void; onEdit: () => void }) {
  const { open, setOpen, ref } = usePop();
  const chosen = Array.isArray(value) ? value : [];
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  return (
    <div ref={ref} className="tt-pillwrap">
      <button type="button" className="bd-tags" aria-haspopup="listbox" aria-expanded={open} aria-label={`${prop.name}`} onClick={() => setOpen(!open)}>
        {chosen.length === 0 && <span className="bd-empty">—</span>}
        {chosen.map((id) => { const o = prop.options.find((x) => x.id === id); return o ? <span key={id} className="bd-chip" style={{ background: o.color }}>{o.label}</span> : null; })}
      </button>
      {open && (
        <div className="tt-menu" role="listbox" aria-label={prop.name}>
          {prop.options.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={chosen.includes(o.id)} className="tt-pill" style={{ background: o.color, opacity: chosen.includes(o.id) ? 1 : 0.55 }} onClick={() => toggle(o.id)}>{chosen.includes(o.id) ? '✓ ' : ''}{o.label}</button>
          ))}
          <button type="button" className="bd-link" onClick={() => { setOpen(false); onEdit(); }}>Edit tags…</button>
        </div>
      )}
    </div>
  );
}

function TextCell({ value, number, label, onChange }: { value: Value | undefined; number?: boolean; label: string; onChange: (v: Value) => void }) {
  const shown = value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const save = () => {
    const clean = text.trim();
    if (clean === shown) return;
    onChange(clean === '' ? null : number ? Number(clean) : clean);
  };
  return <input className="bd-input" type={number ? 'number' : 'text'} value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/** The editor for one value of one property. */
export function Cell({ prop, item, onChange, onEdit }: { prop: Property; item: Item; onChange: (v: Value) => void; onEdit: () => void }) {
  const value = item.values[prop.id];
  switch (prop.type) {
    case 'status':
    case 'select': return <OptionCell prop={prop} value={value} onChange={onChange} onEdit={onEdit} />;
    case 'tags': return <TagsCell prop={prop} value={value} onChange={onChange} onEdit={onEdit} />;
    case 'date': return <input type="date" className="tt-date" aria-label={prop.name} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'checkbox': return <input type="checkbox" className="bd-check" aria-label={prop.name} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case 'number': return <TextCell number value={value} label={prop.name} onChange={onChange} />;
    default: return <TextCell value={value} label={prop.name} onChange={onChange} />;
  }
}

/** Rename a property, edit its options (status, select, tags) or delete it. */
export function PropertyEditor({ prop, onSave, onDelete, onClose }: { prop: Property; onSave: (name: string, options: Option[]) => void; onDelete: () => void; onClose: () => void }) {
  const [name, setName] = useState(prop.name);
  const [options, setOptions] = useState<Option[]>(prop.options);
  const hasOptions = prop.type === 'status' || prop.type === 'select' || prop.type === 'tags';
  const set = (i: number, changes: Partial<Option>) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, ...changes } : x)));
  return (
    <Popup title={`${TYPE_LABEL[prop.type]} property`} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim(), options.filter((o) => o.label.trim())); }}>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Property name" className="bd-field" />
        {hasOptions && (
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={o.id || i} className="bd-opt">
                <input type="color" value={o.color} aria-label="Color" onChange={(e) => set(i, { color: e.target.value })} />
                <input className="bd-field" value={o.label} aria-label="Option name" onChange={(e) => set(i, { label: e.target.value })} />
                {prop.type === 'status' && (
                  <label className="bd-done" title="Counts as finished"><input type="checkbox" checked={!!o.done} onChange={(e) => set(i, { done: e.target.checked })} />Done</label>
                )}
                <button type="button" className="bd-x" aria-label={`Remove ${o.label}`} onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}><Icon name="close-circle" size={16} /></button>
              </div>
            ))}
            <button type="button" className="bd-link" onClick={() => setOptions((all) => [...all, { id: '', label: 'New option', color: nextColor(all.length) }])}>+ Add option</button>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <button type="button" className="bd-btn" style={{ color: 'var(--color-error)' }} onClick={onDelete}>Delete property</button>
          <button type="submit" className="bd-btn bd-primary">Save</button>
        </div>
      </form>
    </Popup>
  );
}
