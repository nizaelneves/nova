import { Suspense, lazy, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { TypesDialog } from './TypesDialog';
import { SourceInput } from './SourceInput';
import { UploadDialog } from './UploadDialog';
import { EditButton, EditDialog, TrashButton } from './EditDialog';
import { HunchVoice } from './HunchVoice';
import { FolderTitle, ThreadPicker } from './Threads';
import { Typed } from './Typed';
import { createType, fileUrl, formatSize, kindInfo, readText, saveText, splitThreads, typeLabel, type SwipeKind, type SwipeLibrary, type SwipeVideo, type TextType } from '../../lib/swipe-api';

const NoteEditor = lazy(() => import('../notes/NoteEditor')); // the block editor is large: loaded when a text opens
const noUpload = () => Promise.reject(new Error('Images are not kept here'));
const key = (v: SwipeVideo) => `${v.folder}/${v.name}`;

/** Copies and prompts: write or edit a piece of text. A new title renames the file. */
function TextEditor({ kind, item, folder, inUse, sources, onClose, onSaved }: { kind: SwipeKind; item: SwipeVideo | null; folder: string; inUse: string[]; sources?: string[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [source, setSource] = useState(item?.source ?? '');
  const [threads, setThreads] = useState<string[]>(item?.threads ?? []);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(!item);
  useEffect(() => {
    if (item) readText(kind, item).then((raw) => { const s = kind === 'ideas' ? splitThreads(raw) : { threads: [] as string[], text: raw }; setText(s.text); if (kind === 'ideas') setThreads(s.threads); setReady(true); }).catch((e) => toast.error(e instanceof Error ? e.message : 'Could not open the copy'));
  }, [item, kind]);
  const save = async () => {
    try { await saveText(kind, item?.folder ?? folder, title, text, item?.name, threads, sources ? source.trim() : undefined); toast.success('Saved'); onSaved(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); }
  };
  return (
    <div className="mm-pad mm-swap">
      <button type="button" className="mm-btn" onClick={onClose}>← Return</button>
      <div className="mm-doc">
        <input className="mm-doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
        {kind === 'ideas' && <ThreadPicker value={threads} onChange={setThreads} inUse={inUse} />}
        {sources && <div className="mm-doc-src"><SourceInput value={source} onChange={setSource} options={sources} /></div>}
        <div className="mm-doc-area">
          {ready ? (
            <Suspense fallback={<div className="mm-doc-load">Opening…</div>}>
              <NoteEditor key={item?.name ?? 'new'} plain markdown={text} mentions={[]} upload={noUpload} onChange={setText} />
            </Suspense>
          ) : <div className="mm-doc-load">Opening…</div>}
          {ready && !text && <Typed text="Write or paste your text here" />}
        </div>
        <div className="mm-acts mm-acts-doc">
          <button type="button" className="mm-btn mm-go mm-save" disabled={!ready || !title.trim()} onClick={() => void save()}>Save</button>
          <button type="button" className="mm-btn mm-cancel" onClick={onClose}>Discard</button></div>
      </div>
    </div>
  );
}

/** Emails (PDFs) and Copy (text): the same folders-on-disk idea as the videos. */
export function SwipeDocs({ kind, lib, folder, setFolder, reload, types = [], reloadTypes }: {
  kind: SwipeKind; lib: SwipeLibrary; folder: string; setFolder: (f: string) => void; reload: () => void; types?: TextType[]; reloadTypes?: () => void;
}) {
  const texts = kind === 'texts'; // E-mails, Copies and the types you made, together: the folders of each act as the Source
  const { one, many } = texts ? { one: 'Copy', many: 'Copies' } : kindInfo(kind);
  const ik = (v: SwipeVideo): SwipeKind => (texts ? v.type ?? '' : kind); // the type a given item belongs to
  const [newType, setNewType] = useState<string | null>(null);
  const [editTypes, setEditTypes] = useState(false);
  const sourceUse = new Map<string, number>();
  lib.items.forEach((v) => { if (v.source) sourceUse.set(v.source, (sourceUse.get(v.source) ?? 0) + 1); });
  const sourceNames = [...sourceUse].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n); // most used first
  const [open, setOpen] = useState<SwipeVideo | null>(null);
  const [writing, setWriting] = useState(false);
  const [upload, setUpload] = useState<File[] | null>(null);
  const [edit, setEdit] = useState<SwipeVideo | null>(null);
  const [speak, setSpeak] = useState(false);
  const hunches = kind === 'ideas'; // hunches hang on threads, not in folders: the chosen "folder" is a thread
  const threadNames = [...new Set(lib.items.flatMap((v) => v.threads ?? []))].sort((a, b) => a.localeCompare(b));
  const picked = hunches && folder !== 'All' && !threadNames.includes(folder) ? 'All' : texts && folder !== 'All' && !types.some((t) => t.id === folder) ? 'All' : folder;
  const shown = picked === 'All' ? lib.items : hunches ? lib.items.filter((v) => v.threads?.includes(picked)) : texts ? lib.items.filter((v) => v.type === picked) : lib.items.filter((v) => v.folder === picked);
  const into = hunches || texts ? 'Unsorted' : picked === 'All' ? lib.folders[0]?.name ?? 'Unsorted' : picked;
  const writeType = texts ? (picked !== 'All' ? picked : types[0]?.id ?? 'emails') : kind; // a new text goes in the chosen type
  const done = (f: string) => { reload(); setFolder(hunches ? 'All' : texts ? picked : f); };

  const isPdf = !!open && open.name.toLowerCase().endsWith('.pdf');
  if (writing || (open && !isPdf)) {
    return <TextEditor kind={open ? ik(open) : writeType} item={open} folder={into} inUse={threadNames} sources={texts ? sourceNames : undefined} onClose={() => { setOpen(null); setWriting(false); }} onSaved={reload} />;
  }
  if (open && isPdf) {
    const src = fileUrl(ik(open), open);
    return (
      <div className="mm-pad mm-swap mm-mail">
        <div className="mm-mail-bar">
          <button type="button" className="mm-btn" onClick={() => setOpen(null)}>← Return</button>
          <div className="mm-mail-id"><b>{open.title}</b><small>{texts ? `${typeLabel(open.type ?? '')} · ` : ''}{open.source ? `${open.source} · ` : ''}{formatSize(open.size)}</small></div>
          <button type="button" className="mm-btn" onClick={() => setEdit(open)}><Icon name="edit" size={15} />Edit</button>
        </div>
        <div className="mm-mail-stage">
          <iframe className="mm-pdf" title={open.title} src={`${src}#toolbar=0&navpanes=0&view=FitH`} />
        </div>
        {edit && <EditDialog kind={ik(edit)} item={edit} folders={lib.folders} texts={texts} sources={sourceNames} onClose={() => setEdit(null)} onDone={(f) => { reload(); setFolder(texts ? picked : f); setOpen(null); }} />}
      </div>
    );
  }
  return (
    <div className="mm-pad mm-swap"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); setUpload([...e.dataTransfer.files]); }}>
      <div className="mm-chips">
        {texts ? ['All', ...types.map((t) => t.id)].map((f) => <button key={f} type="button" className="mm-chip" data-on={f === picked} onClick={() => setFolder(f)}>{f === 'All' ? 'All' : typeLabel(f)}</button>)
          : ['All', ...(hunches ? threadNames : lib.folders.map((f) => f.name))].map((f) => <button key={f} type="button" className="mm-chip" data-on={f === picked} onClick={() => setFolder(f)}>{f}</button>)}
        {texts && <button type="button" className="mm-chip mm-chip-add" onClick={() => setNewType('')} aria-label="New Type">+ Type</button>}
        {texts && <button type="button" className="mm-chip mm-chip-add" onClick={() => setEditTypes(true)} aria-label="Edit Types"><Icon name="edit" size={13} /></button>}
      </div>
      <div className="mm-head">
        {hunches || texts ? <h2>{picked === 'All' ? `All ${many}` : texts ? typeLabel(picked) : picked}</h2> : <FolderTitle kind={kind} folder={picked} text={picked === 'All' ? `All ${many}` : picked} onRenamed={setFolder} />}<span>{shown.length} {shown.length === 1 ? one : many}</span>
        {kind === 'ideas' && <button type="button" className="mm-btn" onClick={() => setSpeak(true)}><Icon name="microphone" size={15} />Record</button>}
        <button type="button" className="mm-btn" onClick={() => setWriting(true)}><Icon name="pen" size={15} />Write {one}</button>
        <button type="button" className="mm-btn mm-go mm-up mm-nomargin" onClick={() => setUpload([])}><Icon name="upload-minimalistic" size={15} />Upload</button>
      </div>
      {shown.length === 0 ? (
        <div className="mm-empty"><b>No {many} Yet</b></div>
      ) : (
        <div className="mm-grid mm-docs">
          {shown.map((v, i) => (
            <div key={key(v)} className="mm-ed">
              <button type="button" className="mm-card" style={{ '--i': Math.min(i, 14) } as React.CSSProperties} onClick={() => setOpen(v)}>
                <Icon name={texts ? (v.name.toLowerCase().endsWith('.pdf') ? 'inbox' : 'writing-sign') : kind === 'prompts' ? 'terminal-window' : 'lightbulb-bolt'} size={24} />
                                <b>{v.title}</b>
                <p>{v.name.toLowerCase().endsWith('.pdf') ? `PDF · ${formatSize(v.size)}` : v.preview}</p>
                {hunches ? <small className="mm-cthreads">{(v.threads ?? []).map((t) => <i key={t}>{t}</i>)}<time className="mm-cdate">{new Date((v.created ?? v.modified) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</time></small> : (texts ? <small className="mm-cfoot"><span className="mm-badge">{typeLabel(v.type ?? '')}</span>{v.source && <span>{v.source}</span>}</small> : <small>{v.folder}</small>)}
              </button>
              <EditButton label={v.title} onEdit={() => setEdit(v)} />
              <TrashButton kind={ik(v)} item={v} folders={lib.folders} onDone={done} />
            </div>
          ))}
        </div>
      )}
      {speak && <HunchVoice inUse={threadNames} onClose={() => setSpeak(false)} onDone={() => done('All')} />}
      {edit && <EditDialog kind={ik(edit)} item={edit} folders={lib.folders} inUse={threadNames} texts={texts} sources={sourceNames} onClose={() => setEdit(null)} onDone={done} />}
      {upload && <UploadDialog kind={writeType} types={texts ? types : undefined} sources={sourceNames} folders={lib.folders} folder={picked} files={upload} onClose={() => setUpload(null)} onDone={done} />}
      {newType !== null && (
        <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setNewType(null); }}>
          <div className="mm-box mm-box-sm" role="dialog" aria-label="New Type">
            <button type="button" className="mm-x" aria-label="Close" onClick={() => setNewType(null)}>×</button>
            <label className="mm-fld"><span>Type Name</span>
              <input value={newType} onChange={(e) => setNewType(e.target.value)} autoFocus placeholder="e.g Scripts, Pages ..."
                onKeyDown={(e) => { if (e.key === 'Enter' && newType.trim()) document.getElementById('mm-newtype-go')?.click(); }} />
            </label>
            <div className="mm-acts">
              <button id="mm-newtype-go" type="button" className="mm-btn mm-go mm-save" disabled={!newType.trim()}
                onClick={() => { createType(newType.trim()).then((t) => { toast.success('Type Added'); reloadTypes?.(); setFolder(t.id); setNewType(null); }).catch((er) => toast.error(er instanceof Error ? er.message : 'Could not add it')); }}>Save</button>
              <button type="button" className="mm-btn mm-cancel" onClick={() => setNewType(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {editTypes && <TypesDialog types={types} sources={[...sourceUse].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))} counts={Object.fromEntries(types.map((t) => [t.id, lib.items.filter((v) => v.type === t.id).length]))} onChanged={() => { reloadTypes?.(); reload(); }} onClose={() => setEditTypes(false)} />}
    </div>
  );
}
