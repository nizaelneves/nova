import { useEffect, useState } from 'react';
import { Icon } from '../Icon';

export type SortMode = 'az' | 'new' | 'old' | 'used';
const LABEL: Record<SortMode, string> = { az: 'A–Z', new: 'Newest', old: 'Oldest', used: 'Most Used' };
const DATES: SortMode[] = ['az', 'new', 'old'];
const read = (key: string, modes: SortMode[]): SortMode => {
  try { const v = localStorage.getItem(`phibe.sort.${key}`) as SortMode; return modes.includes(v) ? v : 'az'; } catch { return 'az'; }
};

/** One screen's order: what is shown now, and the saved default (A–Z until the user saves another). */
export function useSort(key: string, modes: SortMode[] = DATES) {
  const [saved, setSaved] = useState<SortMode>(() => read(key, modes));
  const [mode, setMode] = useState<SortMode>(saved);
  useEffect(() => { const s = read(key, modes); setSaved(s); setMode(s); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    modes, mode, dirty: mode !== saved, set: setMode,
    save: () => { try { localStorage.setItem(`phibe.sort.${key}`, mode); } catch { /* the choice lasts until the page reloads */ } setSaved(mode); },
    cancel: () => setMode(saved),
  };
}

/** "3 Nov 2026" from seconds; empty when there is no date. */
export const dateText = (t?: number) => (t ? new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Date pills under a card, always named: Created, Updated, or both. */
export const Dates = ({ created, updated }: { created?: number; updated?: number }) => (
  <span className="mm-dates">
    {created ? <time className="mm-cdate">Created {dateText(created)}</time> : null}
    {updated ? <time className="mm-cdate">Updated {dateText(updated)}</time> : null}
  </span>
);

export type Sort = ReturnType<typeof useSort>;

/** The rows in the chosen order. Newest and Oldest use `date` (seconds); ties fall back to A–Z. */
export function sortRows<T>(rows: T[], mode: SortMode, name: (r: T) => string, date: (r: T) => number, used: (r: T) => number = () => 0): T[] {
  const az = (a: T, b: T) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base' });
  if (mode === 'used') return [...rows].sort((a, b) => used(b) - used(a) || az(a, b));
  return [...rows].sort(mode === 'az' ? az : (a, b) => (mode === 'new' ? date(b) - date(a) : date(a) - date(b)) || az(a, b));
}

/** A small button beside the screen's main one: pick an order, then save it as this screen's default or cancel. */
export function SortControl({ sort }: { sort: Sort }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mm-sort">
      <button type="button" className="mm-sort-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="sort" size={15} />{LABEL[sort.mode]}
      </button>
      {open && (
        <div className="mm-sort-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {sort.modes.map((m) => <button key={m} type="button" role="menuitemradio" aria-checked={sort.mode === m} data-on={sort.mode === m} onClick={() => { sort.set(m); setOpen(false); }}>{LABEL[m]}</button>)}
        </div>
      )}
      {sort.dirty && (
        <>
          <button type="button" className="mm-sort-ok" aria-label="Save As Default" onClick={sort.save}><Icon name="check-circle" size={20} /></button>
          <button type="button" className="mm-sort-no" aria-label="Cancel" onClick={sort.cancel}><Icon name="close-circle" size={20} /></button>
        </>
      )}
    </span>
  );
}
