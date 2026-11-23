import { useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { disintegrate } from '../../lib/disintegrate';
import { ThreadPicker } from './Threads';
import { SourceInput } from './SourceInput';
import { Pick } from './Pick';
import { trashSwipe, updateSwipe, type SwipeFolder, type SwipeKind, type SwipeVideo } from '../../lib/swipe-api';

const NEW = '\u0000new';

/** The small pen on a card or row: opens the editor without opening the file. */
export function EditButton({ onEdit, label }: { onEdit: () => void; label: string }) {
  return (
    <button type="button" className="mm-edit" aria-label={`Edit ${label}`} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
      <Icon name="edit" size={15} />
    </button>
  );
}

/** Where to land after a file is trashed: its folder if others remain in it, otherwise All. */
export const homeAfterTrash = (item: SwipeVideo, folders: SwipeFolder[]) =>
  item.folder !== 'Unsorted' && (folders.find((f) => f.name === item.folder)?.count ?? 0) > 1 ? item.folder : 'All';

/** The small bin on a card or row, next to the pen: sends the file to the Recycle Bin. */
export function TrashButton({ kind, item, folders, onDone }: { kind: SwipeKind; item: SwipeVideo; folders: SwipeFolder[]; onDone: (folder: string) => void }) {
  return (
    <button type="button" className="mm-edit mm-del" aria-label={`Move ${item.title} To Trash`}
      onClick={(e) => { e.stopPropagation(); const card = e.currentTarget.closest<HTMLElement>('.mm-ed, .mm-track'); void disintegrate(card).then(() => trashSwipe(kind, item)).then(() => { toast.success('Moved To Trash'); onDone(homeAfterTrash(item, folders)); }).catch((er) => toast.error(er instanceof Error ? er.message : 'Could not move it')); }}>
      <Icon name="trash-bin-2" size={14} />
    </button>
  );
}

/** Rename a Swipe File item and/or move it to another folder (or a new one). */
export function EditDialog({ kind, item, folders, inUse = [], texts, sources = [], onClose, onDone }: {
  kind: SwipeKind; item: SwipeVideo; folders: SwipeFolder[]; inUse?: string[]; texts?: boolean; sources?: string[]; onClose: () => void; onDone: (folder: string) => void;
}) {
  const hunch = kind === 'ideas';
  const [threads, setThreads] = useState<string[]>(item.threads ?? []);
  const [title, setTitle] = useState(item.title);
  const [source, setSource] = useState(item.source ?? ''); // texts: where it comes from
  const [dest, setDest] = useState(item.folder);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);
  const names = folders.some((f) => f.name === item.folder) ? folders.map((f) => f.name) : [item.folder, ...folders.map((f) => f.name)];
  const target = dest === NEW ? fresh.trim() : dest;
  const changed = title.trim() !== item.title || (texts && source.trim() !== (item.source ?? '')) || (hunch ? threads.join('\u0000') !== (item.threads ?? []).join('\u0000') : target !== item.folder);

  const save = async () => {
    setBusy(true);
    try {
      const done = await updateSwipe(kind, item, { title: title.trim(), folder: hunch || texts ? item.folder : target, threads: hunch ? threads : undefined, source: texts ? source.trim() : undefined });
      toast.success('Saved');
      onDone(done.folder);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); setBusy(false); }
  };

  const trash = async () => {
    setBusy(true);
    try { await disintegrate(document.querySelector<HTMLElement>('.mm-box-sm')); await trashSwipe(kind, item); toast.success('Moved To Trash'); onDone(homeAfterTrash(item, folders)); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not move it'); setBusy(false); }
  };

  return (
    <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="mm-box mm-box-sm" role="dialog" aria-label={`Edit ${item.title}`}>
        <button type="button" className="mm-x" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        <label className="mm-fld"><span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && changed && title.trim() && (texts || target) && !busy) void save(); }} />
        </label>
        {texts && <div className="mm-fld"><span>Origin</span><SourceInput value={source} onChange={setSource} options={sources} disabled={busy} /></div>}
        {texts ? null : hunch ? <div className="mm-fld"><span>Threads</span><ThreadPicker value={threads} onChange={setThreads} inUse={inUse} /></div> : <div className="mm-fld"><span>Folder</span><Pick label="Folder" value={dest} onChange={setDest} disabled={busy} options={[...names.map((n) => ({ value: n, label: n })), { value: NEW, label: 'New Folder…' }]} /></div>}
        {!hunch && !texts && dest === NEW && <label className="mm-fld"><span>New Folder</span><input value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Folder name" disabled={busy} autoFocus /></label>}
        <div className="mm-acts">
          <button type="button" className="mm-btn mm-go mm-save" data-busy={busy} onClick={() => void save()} disabled={busy || !changed || !title.trim() || (!hunch && !texts && !target)}>Save</button>
          <button type="button" className="mm-btn mm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="mm-btn mm-trash" onClick={() => void trash()} disabled={busy} aria-label="Move To Trash"><Icon name="trash-bin-2" size={16} />Trash</button>
        </div>
      </div>
    </div>
  );
}
