import { useState } from 'react';
import { toast } from 'sonner';
import { SourceInput } from './SourceInput';
import { createSwipeFolder, formatSize, kindInfo, saveLink, uploadSwipe, type SwipeFolder, type SwipeKind, type TextType } from '../../lib/swipe-api';

const NEW = '\u0000new';

interface Row { file: File; done: number; error?: string }

/** Choose videos (or drop them on the page), pick the folder they go in, and send them. */
export function UploadDialog({ kind, types, sources = [], folders, folder, files, onClose, onDone }: {
  kind: SwipeKind; types?: TextType[]; sources?: string[]; folders: SwipeFolder[]; folder: string; files: File[]; onClose: () => void; onDone: (folder: string) => void;
}) {
  const [type, setType] = useState(kind); // text types: pick which one it goes in
  const { ext, one, many } = kindInfo(type);
  const isOk = (f: File) => ext.some((e) => f.name.toLowerCase().endsWith(e));
  const [rows, setRows] = useState<Row[]>(() => files.filter(isOk).map((file) => ({ file, done: 0 })));
  const [dest, setDest] = useState(kind === 'ideas' ? 'Unsorted' : folders.some((f) => f.name === folder) ? folder : folders[0]?.name ?? NEW);
  const [fresh, setFresh] = useState('');
  const [source, setSource] = useState(''); // texts: where it comes from (there are no folders for texts)
  const [busy, setBusy] = useState(false);

  const add = (list: FileList | File[]) => {
    const picked = [...list];
    if (picked.some((f) => !isOk(f))) toast.error(`Only ${ext.join(', ')} files here`);
    setRows((r) => [...r, ...picked.filter(isOk).map((file) => ({ file, done: 0 }))]);
  };
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x)));

  const [mode, setMode] = useState<'files' | 'link'>('files'); // e-mails can also come from a link
  const [link, setLink] = useState('');

  const send = async () => {
    const name = types ? 'Unsorted' : dest === NEW ? fresh.trim() : dest;
    if (!name) { toast.error('Give the folder a name'); return; }
    setBusy(true);
    let failed = 0;
    try {
      if (!types && dest === NEW) await createSwipeFolder(name, type);
      if (mode === 'link') {
        try { await saveLink(type, link.trim(), name, source.trim()); }
        catch (e) { failed = 1; toast.error(e instanceof Error ? e.message : 'Could not save that link'); }
        setBusy(false);
        onDone(name);
        if (!failed) { toast.success('Email Added'); onClose(); }
        return;
      }
      for (const [i, row] of rows.entries()) {
        if (row.done >= 1) continue;
        patch(i, { error: undefined });
        try { await uploadSwipe(type, name, row.file, (done) => patch(i, { done }), source.trim()); patch(i, { done: 1 }); }
        catch (e) { failed += 1; patch(i, { error: e instanceof Error ? e.message : 'Upload failed' }); }
      }
    } catch (e) { failed = rows.length; toast.error(e instanceof Error ? e.message : 'Could not create the folder'); }
    setBusy(false);
    onDone(name);
    if (!failed) { toast.success(rows.length > 1 ? `${many} Added` : `${one} Added`); onClose(); }
  };

  return (
    <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="mm-box" role="dialog" aria-label="Upload">
        {types && (
          <div className="mm-chips">
            <button type="button" className="mm-chip" data-on={mode === 'files'} onClick={() => setMode('files')} disabled={busy}>Archives</button>
            <button type="button" className="mm-chip" data-on={mode === 'link'} onClick={() => setMode('link')} disabled={busy}>Links</button>
          </div>
        )}
        {mode === 'link' ? (
          <div className="mm-zone mm-linkbox">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" disabled={busy} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && link.trim() && !busy) void send(); }} />
          </div>
        ) : (
          <label className="mm-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
            <span>Drag Files Or Click To Choose</span>
            <small>{ext.join(' ')}</small>
            <input type="file" multiple hidden accept={ext.join(',')} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
          </label>
        )}
        {types && types.length > 1 && <div className="mm-row"><span>Type</span><select value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>{types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>}
        {types && <div className="mm-row"><span>Source</span><SourceInput value={source} onChange={setSource} options={sources} disabled={busy} /></div>}
        {kind !== 'ideas' && !types && <div className="mm-row">
          <span>Folder</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)} disabled={busy}>
            {folders.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            <option value={NEW}>New Folder…</option>
          </select>
          {dest === NEW && <input value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Folder name" disabled={busy} autoFocus />}
        </div>}
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
          <button type="button" className="mm-btn mm-go mm-save" data-busy={busy} onClick={() => void send()} disabled={busy || (mode === 'link' ? !link.trim() : rows.length === 0)}>{busy ? (mode === 'link' ? 'Saving…' : 'Uploading…') : mode === 'link' ? 'Save' : 'Upload'}</button>
          <button type="button" className="mm-btn mm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
