import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { renameSwipeFolder, type SwipeKind } from '../../lib/swipe-api';

/** Threads: as many as you like, chosen from your Notes' tags or made up on the spot. */
export function ThreadPicker({ value, onChange, inUse = [] }: { value: string[]; onChange: (v: string[]) => void; inUse?: string[] }) {
  const [text, setText] = useState('');
  const options = inUse.filter((t) => !value.some((v) => v.toLowerCase() === t.toLowerCase()));
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '');
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText('');
  };
  // The single most likely thread, shown faded after what is typed (as in Finances): one that starts with it.
  const typed = text.trimStart().replace(/^#/, '');
  const guess = typed ? options.find((o) => o.toLowerCase().startsWith(typed.toLowerCase()) && o.toLowerCase() !== typed.trim().toLowerCase()) : undefined;
  return (
    <div className="mm-threads">
      <div className="mm-tchips">
        {value.map((t) => <span key={t} className="mm-tchip">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>×</button></span>)}
        <span className="mm-tin">
          <input value={text} aria-label="Add a thread" autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              const atEnd = e.currentTarget.selectionStart === text.length;
              if (guess && (e.key === 'Tab' || e.key === 'Enter' || (e.key === 'ArrowRight' && atEnd))) { e.preventDefault(); add(guess); }
              else if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); }
              else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
            }}
            onBlur={() => { if (text.trim()) add(text); }} />
          {guess && <span className="mm-tghost" aria-hidden="true"><i>{text}</i>{guess.slice(typed.length)}</span>}
        </span>
      </div>
    </div>
  );
}

/** The heading of a folder, with a pen to rename the shelf itself (All and Unclassified stay as they are). */
export function FolderTitle({ kind, folder, text, onRenamed }: { kind: SwipeKind; folder: string; text: string; onRenamed: (name: string) => void }) {
  return <><h2>{text}</h2><RenameShelf kind={kind} folder={folder} onRenamed={onRenamed} /></>;
}

/** The pen (and its dialog) that renames a shelf. */
export function RenameShelf({ kind, folder, onRenamed }: { kind: SwipeKind; folder: string; onRenamed: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(folder);
  const [busy, setBusy] = useState(false);
  const fixed = folder === 'All' || folder === 'Unclassified';
  const save = async () => {
    setBusy(true);
    try { const r = await renameSwipeFolder(kind, folder, name.trim()); toast.success('Shelf Renamed'); onRenamed(r.name); setOpen(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not rename'); }
    setBusy(false);
  };
  return (
    <>
      {!fixed && <button type="button" className="mm-edit mm-edit-inline" aria-label="Rename Shelf" onClick={() => { setName(folder); setOpen(true); }}><Icon name="lucide-file-pen" size={15} /></button>}
      {open && (
        <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="mm-box mm-box-sm" role="dialog" aria-label="Rename Shelf">
            <label className="mm-fld"><span>Shelf Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={busy} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && name.trim() !== folder && !busy) void save(); }} />
            </label>
            <div className="mm-acts">
              <button type="button" className="mm-btn mm-cancel" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="mm-btn mm-go mm-save" onClick={() => void save()} disabled={busy || !name.trim() || name.trim() === folder}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
