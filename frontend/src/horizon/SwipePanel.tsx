import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Icon } from '../components/Icon';
import { HunchVoice } from '../components/memoir/HunchVoice';
import { Pick } from '../components/memoir/Pick';
import { dateText } from '../components/memoir/SortControl';
import { ThreadPicker } from '../components/memoir/Threads';
import { UploadDialog } from '../components/memoir/UploadDialog';
import { createSwipeFolder, listSwipe, readText, saveText, shelfOptions, splitThreads, trashSwipe, type SwipeLibrary, type SwipeVideo } from '../lib/swipe-api';
import { SidePanel } from './SidePanel';
import './swipeWidget.css';

type Kind = 'ideas' | 'prompts';
const COPY = {
  ideas: { title: 'Hunches', one: 'Hunch', empty: 'No Hunches Yet.' },
  prompts: { title: 'Prompts', one: 'Prompt', empty: 'No Prompts Yet.' },
} as const;
const NEW = '\u0000new';
const why = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const key = (v: Pick<SwipeVideo, 'folder' | 'name'>) => `${v.folder}/${v.name}`;

/** The Swipe File's list of one kind (Hunches or Prompts), read each time the panel opens. */
function useLibrary(kind: Kind, open: boolean) {
  const [lib, setLib] = useState<SwipeLibrary | null>(null);
  const reload = useCallback(() => listSwipe(kind).then(setLib).catch(() => setLib({ folders: [], items: [] })), [kind]);
  useEffect(() => { if (open) void reload(); }, [open, reload]);
  return { lib, reload };
}

/** Write a new Hunch or Prompt, or open one to read and change it. A simple text box: the full editor stays in Memoir. */
function ItemDialog({ kind, item, folder, folders, inUse, onClose, onSaved }: {
  kind: Kind; item: SwipeVideo | null; folder: string; folders: string[]; inUse: string[]; onClose: () => void; onSaved: () => void;
}) {
  const hunch = kind === 'ideas';
  const [title, setTitle] = useState(item?.title ?? '');
  const [text, setText] = useState('');
  const [threads, setThreads] = useState<string[]>(item?.threads ?? []);
  const [dest, setDest] = useState(folder);
  const [ready, setReady] = useState(!item);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    readText(kind, item)
      .then((raw) => { const s = hunch ? splitThreads(raw) : { threads: [] as string[], text: raw }; setText(s.text); if (hunch) setThreads(s.threads); setReady(true); })
      .catch((e) => { toast.error(why(e)); onClose(); });
  }, [item, kind, hunch, onClose]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      const shelf = dest === NEW ? fresh.trim() : dest;
      if (!item && !hunch && dest === NEW) { if (!shelf) { toast.error('Give the shelf a name'); setBusy(false); return; } await createSwipeFolder(shelf, kind); }
      await saveText(kind, item?.folder ?? shelf, title.trim(), text, item?.name, threads); toast.success(`${COPY[kind].one} Saved`); onSaved(); onClose(); }
    catch (e) { toast.error(why(e)); setBusy(false); }
  };

  return createPortal(
    <div className="hzs">
      <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
        <div className="mm-box hzs-box" role="dialog" aria-label={item ? `Edit ${COPY[kind].one}` : `Write ${COPY[kind].one}`}>
          <button type="button" className="mm-x" aria-label="Close" onClick={onClose}>×</button>
          <label className="mm-fld"><span>Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus disabled={busy} />
          </label>
          {hunch && <div className="mm-fld"><span>Threads</span><ThreadPicker value={threads} onChange={setThreads} inUse={inUse} /></div>}
          {!hunch && !item && folders.length > 0 && (
            <div className="mm-fld"><span>Shelf</span><Pick label="Shelf" value={dest} onChange={setDest} disabled={busy} options={shelfOptions(folders)} />
              {dest === NEW && <input value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Shelf name" disabled={busy} autoFocus />}</div>
          )}
          <label className="mm-fld"><span>{hunch ? 'Note' : 'Prompt'}</span>
            <textarea className="mm-vtext hzs-text" value={ready ? text : 'Opening…'} onChange={(e) => setText(e.target.value)} disabled={!ready || busy} placeholder={`Write or paste your ${COPY[kind].one.toLowerCase()} here`} />
          </label>
          <div className="mm-acts">
            <button type="button" className="mm-btn mm-go mm-save" disabled={!ready || busy || !title.trim()} onClick={() => void save()}>Save</button>
            <button type="button" className="mm-btn mm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One kind of the Swipe File in the widget window: see everything, and do the same things as in Memoir. */
function SwipePanel({ kind, open }: { kind: Kind; open: boolean }) {
  const c = COPY[kind];
  const hunch = kind === 'ideas';
  const { lib, reload } = useLibrary(kind, open);
  const [pick, setPick] = useState('All');
  const [editing, setEditing] = useState<SwipeVideo | 'new' | null>(null);
  const [recording, setRecording] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const items = lib?.items ?? [];
  const threadNames = useMemo(() => [...new Set(items.flatMap((v) => v.threads ?? []))].sort((a, b) => a.localeCompare(b)), [items]);
  const folders = (lib?.folders ?? []).map((f) => f.name);
  const filters = hunch ? threadNames : folders;
  const active = pick === 'All' || filters.includes(pick) ? pick : 'All';
  const shown = items
    .filter((v) => active === 'All' || (hunch ? v.threads?.includes(active) : v.folder === active))
    .sort((a, b) => (b.created ?? b.modified) - (a.created ?? a.modified));
  const into = hunch ? 'Unclassified' : active === 'All' ? folders[0] ?? 'Unclassified' : active;

  const copy = async (v: SwipeVideo) => {
    try { const raw = await readText(kind, v); await navigator.clipboard.writeText(hunch ? splitThreads(raw).text : raw); toast.success('Copied'); }
    catch (e) { toast.error(why(e)); }
  };
  const trash = (v: SwipeVideo) => {
    if (sure !== key(v)) { setSure(key(v)); return; }
    setSure(null);
    trashSwipe(kind, v).then(() => { toast.success('Moved To Trash'); void reload(); }).catch((e) => toast.error(why(e)));
  };

  return (
    <SidePanel open={open} label={c.title}>
      <header className="hzs-head">
        <h3>{c.title}<span>{items.length}</span></h3>
        <div className="hzs-tools">
          {hunch && <button type="button" className="fin-act" aria-label="Record" title="Record" onClick={() => setRecording(true)}><Icon name="phibe-hunch" size={15} /><span>Record</span></button>}
          <button type="button" className="fin-act" aria-label="Write" title="Write" onClick={() => setEditing('new')}><Icon name="lucide-file-pen-line" size={15} /><span>Write</span></button>
          <button type="button" className="fin-act" aria-label="Upload" title="Upload" onClick={() => setUploading(true)}><Icon name="lucide-cloud-upload" size={15} /><span>Upload</span></button>
        </div>
      </header>

      {filters.length > 0 && (
        <div className="hzs-chips">
          {hunch && <span className="mm-thlabel">Threads</span>}
          {['All', ...filters].map((f) => <button key={f} type="button" data-on={f === active} onClick={() => setPick(f)}>{f}</button>)}
        </div>
      )}

      {lib === null ? <p className="hzs-note">Opening…</p> : shown.length === 0 ? <p className="hzs-note">{c.empty}</p> : (
        <ul className="hzs-list">
          {shown.map((v) => (
            <li key={key(v)} style={{ ['--acts' as string]: hunch ? 2 : 3 }}>
              <button type="button" className="hzs-item" onClick={() => setEditing(v)}>
                <b>{v.title}</b>
                {v.preview && <p>{v.preview}</p>}
                <small>
                  {hunch && (v.threads ?? []).length > 0 && <><span className="mm-thlabel">{(v.threads ?? []).length > 1 ? 'Threads' : 'Thread'}</span>{(v.threads ?? []).map((t) => <i key={t}>{t}</i>)}</>}
                  {!hunch && <i>{v.folder}</i>}
                  <time>{hunch ? 'Created' : 'Updated'} {dateText(hunch ? v.created ?? v.modified : v.modified)}</time>
                </small>
              </button>
              <div className="hzs-acts">
                <button type="button" aria-label={`Edit ${v.title}`} title="Edit" onClick={() => setEditing(v)}><Icon name="lucide-file-pen" size={14} /></button>
                {!hunch && <button type="button" aria-label={`Copy ${v.title}`} title="Copy" onClick={() => void copy(v)}><Icon name="ph-copy" size={14} /></button>}
                <button type="button" data-danger aria-label={`Move ${v.title} To Trash`} title="Trash" onBlur={() => setSure(null)} onClick={() => trash(v)}>
                  <Icon name="lucide-trash" size={14} />{sure === key(v) && <em>Sure?</em>}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && <ItemDialog kind={kind} item={editing === 'new' ? null : editing} folder={into} folders={folders.length ? folders : ['Unclassified']} inUse={threadNames} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
      {uploading && createPortal(<div className="hzs"><UploadDialog inUse={threadNames} kind={kind} folders={lib?.folders ?? []} folder={into} files={[]} onClose={() => setUploading(false)} onDone={() => void reload()} /></div>, document.body)}
      {recording && createPortal(<div className="hzs"><HunchVoice theme="phibe" inUse={threadNames} onClose={() => setRecording(false)} onDone={() => void reload()} /></div>, document.body)}
    </SidePanel>
  );
}

export const HunchesPanel = ({ open }: { open: boolean }) => <SwipePanel kind="ideas" open={open} />;
export const PromptsPanel = ({ open }: { open: boolean }) => <SwipePanel kind="prompts" open={open} />;
