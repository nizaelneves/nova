import { useState } from 'react';
import { toast } from 'sonner';
import { formatSize } from '../../lib/swipe-api';
import { uploadNoteFile } from '../../lib/notes-api';

const FORMATS = {
  Files: ['.pdf', '.txt', '.md', '.docx', '.xlsx', '.pptx', '.csv', '.zip', '.mp3', '.m4a', '.wav'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'],
  Videos: ['.mp4', '.m4v', '.mov', '.webm', '.mkv'],
};

interface Row { file: File; done: number; error?: string }

/** Choose files (or drop them), see them listed, and send them: the same window as the Swipe File's upload. */
export function FileUpload({ noun, onClose, onDone }: { noun: 'Files' | 'Images' | 'Videos'; onClose: () => void; onDone: () => void }) {
  const ext = FORMATS[noun];
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const isOk = (f: File) => ext.some((e) => f.name.toLowerCase().endsWith(e));
  const add = (list: FileList | File[]) => {
    const picked = [...list];
    if (picked.some((f) => !isOk(f))) toast.error(`Only ${ext.join(', ')} files here`);
    setRows((r) => [...r, ...picked.filter(isOk).map((file) => ({ file, done: 0 }))]);
  };
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x)));
  const send = async () => {
    setBusy(true);
    let failed = 0;
    for (const [i, row] of rows.entries()) {
      if (row.done >= 1) continue;
      patch(i, { error: undefined });
      try { await uploadNoteFile(row.file); patch(i, { done: 1 }); }
      catch (e) { failed += 1; patch(i, { error: e instanceof Error ? e.message : 'Upload failed' }); }
    }
    setBusy(false);
    onDone();
    if (!failed) { toast.success(rows.length > 1 ? `${noun} Added` : `${noun.slice(0, -1)} Added`); onClose(); }
  };
  return (
    <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="mm-box" role="dialog" aria-label="Upload">
        <label className="mm-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
          <span>Drag Files Or Click To Choose</span>
          <small>{ext.join(' ')}</small>
          <input type="file" multiple hidden accept={ext.join(',')} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
        </label>
        <div className="mm-files">
          {rows.map((r, i) => (
            <div key={i} className="mm-file">
              <span>{r.file.name}</span><span>{formatSize(r.file.size)}</span>
              <i><u style={{ width: `${r.done * 100}%` }} /></i>
              {r.error && <em>{r.error}</em>}
            </div>
          ))}
        </div>
        <div className="mm-acts">
          <button type="button" className="mm-btn mm-go mm-save" data-busy={busy} onClick={() => void send()} disabled={busy || rows.length === 0}>{busy ? 'Uploading…' : 'Upload'}</button>
          <button type="button" className="mm-btn mm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
