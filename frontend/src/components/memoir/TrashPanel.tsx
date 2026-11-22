import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { disintegrate } from '../../lib/disintegrate';
import { formatSize, typeLabel, listTrash, purgeTrashed, restoreTrashed, type TrashItem } from '../../lib/swipe-api';
import { listNotes, restoreNote, type NoteSummary } from '../../lib/notes-api';

const when = (t: number) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Memoir's Trash: Swipe File items and Notes that were deleted. Restore puts them back; Delete Forever cannot be undone. */
export function TrashPanel({ onChange }: { onChange: () => void }) {
  const [files, setFiles] = useState<TrashItem[] | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const load = useCallback(() => {
    void listTrash().then(setFiles).catch(() => setFiles([]));
    void listNotes({ trashed: true }).then(setNotes).catch(() => setNotes([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = (msg: string) => { toast.success(msg); load(); onChange(); };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something Went Wrong');
  const empty = files?.length === 0 && notes.length === 0;
  return (
    <div className="mm-pad mm-swap">
      <div className="mm-head"><h2>Trash</h2><span>{(files?.length ?? 0) + notes.length} Items</span></div>
      {files === null ? null : empty ? <div className="mm-empty"><b>The Trash Is Empty</b></div> : (
        <>
          {files.length > 0 && <h5 className="mm-trash-h">Swipe File</h5>}
          <ol className="mm-trash-list">
            {files.map((t) => (
              <li key={`${t.kind}/${t.folder}/${t.name}`}>
                <div><b>{t.title}</b><small>{typeLabel(t.kind)} · {t.folder} · {formatSize(t.size)} · Deleted {when(t.deleted)}</small></div>
                <button type="button" className="mm-btn" onClick={() => restoreTrashed(t).then(() => done('Restored')).catch(fail)}><Icon name="refresh" size={14} />Restore</button>
                <button type="button" className="mm-btn mm-danger" onClick={(e) => { const row = e.currentTarget.closest<HTMLElement>('li'); void disintegrate(row).then(() => purgeTrashed(t)).then(() => done('Deleted Forever')).catch(fail); }}><Icon name="close-circle" size={14} />Delete Forever</button>
              </li>
            ))}
          </ol>
          {notes.length > 0 && <h5 className="mm-trash-h">Notes</h5>}
          <ol className="mm-trash-list">
            {notes.map((n) => (
              <li key={n.id}>
                <div><b>{n.title || 'Untitled'}</b><small>Note</small></div>
                <button type="button" className="mm-btn" onClick={() => restoreNote(n.id).then(() => done('Note Restored')).catch(fail)}><Icon name="refresh" size={14} />Restore</button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
