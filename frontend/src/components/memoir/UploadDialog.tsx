import { useState } from 'react';
import { toast } from 'sonner';
import { Pick } from './Pick';
import { ThreadPicker } from './Threads';
import { createSwipeFolder, formatSize, kindInfo, saveLink, shelfOptions, uploadSwipe, type SwipeFolder, type SwipeKind, type TextType } from '../../lib/swipe-api';

const NEW = '\u0000new';

interface Row { file: File; done: number; error?: string }

/** Choose videos (or drop them on the page), pick the folder they go in, and send them. */
export function UploadDialog({ kind, types, shelvesOf, folders, folder, files, inUse = [], onClose, onDone }: {
  inUse?: string[]; kind: SwipeKind; types?: TextType[]; shelvesOf?: (type: string) => SwipeFolder[]; folders: SwipeFolder[]; folder: string; files: File[]; onClose: () => void; onDone: (folder: string) => void;
}) {
  const [type, setType] = useState(kind); // text types: pick which one it goes in
  const { ext, one, many } = kindInfo(type);
  const isOk = (f: File) => ext.some((e) => f.name.toLowerCase().endsWith(e));
  const [rows, setRows] = useState<Row[]>(() => files.filter(isOk).map((file) => ({ file, done: 0 })));
  const shelves = types && shelvesOf ? shelvesOf(type) : folders;
  const [dest, setDest] = useState(kind === 'ideas' || types ? 'Unclassified' : folders.some((f) => f.name === folder) ? folder : folders[0]?.name ?? NEW);
  const [fresh, setFresh] = useState('');
  const [threads, setThreads] = useState<string[]>([]); // Hunches: the threads every file gets
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
    const name = dest === NEW ? fresh.trim() : dest;
    if (!name) { toast.error('Give the shelf a name'); return; }
    setBusy(true);
    let failed = 0;
    try {
      if (dest === NEW) await createSwipeFolder(name, type);
      if (mode === 'link') {
        try { await saveLink(type, link.trim(), name); }
        catch (e) { failed = 1; toast.error(e instanceof Error ? e.message : 'Could not save that link'); }
        setBusy(false);
        onDone(name);
        if (!failed) { toast.success('Email Added'); onClose(); }
        return;
      }
      for (const [i, row] of rows.entries()) {
        if (row.done >= 1) continue;
        patch(i, { error: undefined });
        try { await uploadSwipe(type, name, row.file, (done) => patch(i, { done }), '', threads); patch(i, { done: 1 }); }
        catch (e) { failed += 1; patch(i, { error: e instanceof Error ? e.message : 'Upload failed' }); }
      }
    } catch (e) { failed = rows.length; toast.error(e instanceof Error ? e.message : 'Could not create the shelf'); }
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
        {types && types.length > 0 && <div className="mm-row"><span>Type</span><Pick label="Type" value={type} onChange={(v) => { setType(v); setDest('Unclassified'); }} disabled={busy} options={types.map((t) => ({ value: t.id, label: t.label }))} /></div>}
        {kind === 'ideas' && <div className="mm-fld"><span>Threads</span><ThreadPicker value={threads} onChange={setThreads} inUse={inUse} /></div>}
        {kind !== 'ideas' && <div className="mm-row">
          <span>Shelf</span>
          <Pick label="Shelf" value={dest} onChange={setDest} disabled={busy} options={shelfOptions(shelves.map((f) => f.name))} />
          {dest === NEW && <input value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Shelf name" disabled={busy} autoFocus />}
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
