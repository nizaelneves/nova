import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { listTags } from '../../lib/notes-api';
import { renameSwipeFolder, type SwipeKind } from '../../lib/swipe-api';

/** The tags of All Notes, so a hunch can hang on the same projects and areas. Read once. */
let known: string[] | null = null;
export function useNoteTags(): string[] {
  const [tags, setTags] = useState<string[]>(known ?? []);
  useEffect(() => {
    if (known) return;
    listTags().then((t) => { known = t.map((x) => x.name); setTags(known); }).catch(() => { /* no suggestions */ });
  }, []);
  return tags;
}

/** Threads: as many as you like, chosen from your Notes' tags or made up on the spot. */
export function ThreadPicker({ value, onChange, inUse = [] }: { value: string[]; onChange: (v: string[]) => void; inUse?: string[] }) {
  const [text, setText] = useState('');
  const fromNotes = useNoteTags();
  const options = [...new Set([...inUse, ...fromNotes])].filter((t) => !value.some((v) => v.toLowerCase() === t.toLowerCase()));
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '');
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText('');
  };
  const match = text.trim() ? options.filter((o) => o.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="mm-threads">
      <div className="mm-tchips">
        {value.map((t) => <span key={t} className="mm-tchip">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>×</button></span>)}
        <input value={text} placeholder={value.length ? '' : 'Add A Thread'} aria-label="Add a thread"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => { if (text.trim()) add(text); }} />
      </div>
      {match.length > 0 && <div className="mm-tsug">{match.map((o) => <button key={o} type="button" onMouseDown={(e) => { e.preventDefault(); add(o); }}>{o}</button>)}</div>}
    </div>
  );
}

/** The heading of a folder, with a pen to rename the folder itself (All and Unsorted stay as they are). */
export function FolderTitle({ kind, folder, text, onRenamed }: { kind: SwipeKind; folder: string; text: string; onRenamed: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(folder);
  const [busy, setBusy] = useState(false);
  const fixed = folder === 'All' || folder === 'Unsorted';
  const save = async () => {
    setBusy(true);
    try { const r = await renameSwipeFolder(kind, folder, name.trim()); toast.success('Folder Renamed'); onRenamed(r.name); setOpen(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not rename'); }
    setBusy(false);
  };
  return (
    <>
      <h2>{text}</h2>
      {!fixed && <button type="button" className="mm-edit mm-edit-inline" aria-label="Rename Folder" onClick={() => { setName(folder); setOpen(true); }}><Icon name="edit" size={15} /></button>}
      {open && (
        <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="mm-box mm-box-sm" role="dialog" aria-label="Rename Folder">
            <label className="mm-fld"><span>Folder Name</span>
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
