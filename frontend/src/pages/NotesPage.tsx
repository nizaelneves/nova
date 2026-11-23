import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Icon, type IconName } from '../components/Icon';
import { disintegrate } from '../lib/disintegrate';
import { CollectionEditor, TagEditor } from '../components/notes/Organize';
import { GraphView } from '../components/notes/GraphView';
import { FileUpload } from '../components/notes/FileUpload';
import { AttachmentsTable, CollectionsTable, NotesTable, setTagColors } from '../components/notes/SetTable';
import { SortControl, useSort } from '../components/memoir/SortControl';
import { TagsManager } from '../components/notes/TagsManager';
import { FileView } from '../components/notes/FileView';
import {
  type Attachment, type CollectionCount, type Note, type NoteDraft, type RelatedNote, type NoteSummary, type NotesStatus, type SearchHit, type TagCount,
  createBookmark, createCollection, createNote, deleteCollection, renameCollection, deleteNoteFile, setFileNotes, setFileTags, getNote, listAttachments, listCollections, listNotes, listTags,
  notesStatus, patchNote, reindexNotes, relatedNotes, restoreNote, searchNotes, setNoteCollections, trashNote, uploadNoteFile,
} from '../lib/notes-api';
import { mentionedNoteId, plainSnippet, tidyMarkdown, whenText, withoutTitle } from '../lib/notes';

// The editor is large, so it is only fetched when a note is opened for editing.
const NoteEditor = lazy(() => import('../components/notes/NoteEditor'));

type Scope =
  | { kind: 'all' }
  | { kind: 'bookmarks' }
  | { kind: 'pages' }
  | { kind: 'collections' }
  | { kind: 'files' }
  | { kind: 'images' }
  | { kind: 'videos' }
  | { kind: 'tags' }
  | { kind: 'trash' }
  | { kind: 'graph' }
  | { kind: 'collection'; id: string; name: string }
  | { kind: 'tag'; name: string };

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const same = (a: Scope, b: Scope) => JSON.stringify(a) === JSON.stringify(b);
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something Went Wrong');
const SAVE_AFTER_MS = 900;

/** Notes: Phibe's own second brain, laid out as a tree on the left, a set or a page in the middle. */
const SORTED = new Set(['bookmarks', 'collections', 'files', 'images', 'pages', 'videos']); // screens with an order control

export function NotesPage() {
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [catalog, setCatalog] = useState<NoteSummary[]>([]); // every live note: recent list and the @ menu
  const [tags, setTags] = useState<TagCount[]>([]);
  const [collections, setCollections] = useState<CollectionCount[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newBookmark, setNewBookmark] = useState<string | null>(null);
  const [newCollection, setNewCollection] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set()); // rows ticked, to delete several at once
  const [sure, setSure] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null); // a file opened inside Memoir
  const [uploading, setUploading] = useState(false);
  const [renamingColl, setRenamingColl] = useState<string | null>(null);
  const [sureColl, setSureColl] = useState(false);
  const [status, setStatus] = useState<NotesStatus | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [related, setRelated] = useState<RelatedNote[]>([]);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const titles = useRef<Map<string, string>>(new Map());

  const remember = (rows: NoteSummary[]) => rows.forEach((r) => titles.current.set(r.id, r.title));

  const refreshSide = useCallback(() => {
    void Promise.all([listTags(), listCollections(), notesStatus(), listNotes({}), listAttachments()])
      .then(([t, c, s, all, a]) => { setTags(t); setCollections(c); setStatus(s); remember(all); setCatalog(all); setAttachments(a); })
      .catch((e) => toast.error(message(e)));
  }, []);
  useEffect(refreshSide, [refreshSide]);

  const loadList = useCallback((s: Scope) => {
    const filter = s.kind === 'tag' ? { tag: s.name } : s.kind === 'collection' ? { collection: s.id }
      : s.kind === 'bookmarks' ? { kind: 'bookmark' } : s.kind === 'pages' ? { kind: 'page' } : s.kind === 'trash' ? { trashed: true } : {};
    return listNotes(filter).then((rows) => { remember(rows); setNotes(rows); })
      .catch((e) => { toast.error(message(e)); setNotes([]); });
  }, []);
  useEffect(() => { setNotes(null); void loadList(scope); }, [scope, loadList]);

  /** After something changed, bring every list that shows notes up to date. */
  const refreshAll = useCallback(() => {
    refreshSide();
    void loadList(scope);
  }, [refreshSide, loadList, scope]);

  // ---- saving: what is typed waits a moment, then goes to Phibe; leaving the note or the page sends it at once ----
  const pending = useRef<{ id: string; draft: NoteDraft } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    try {
      const saved = await patchNote(job.id, job.draft);
      titles.current.set(saved.id, saved.title);
      const patchRow = (r: NoteSummary) => (r.id === saved.id ? { ...r, title: saved.title, tags: saved.tags, updated_at: saved.updated_at } : r);
      setNotes((rows) => rows && rows.map(patchRow));
      setCatalog((rows) => rows.map(patchRow));
      setNote((cur) => (cur && cur.id === saved.id ? { ...cur, updated_at: saved.updated_at, local_edit: saved.local_edit, links: saved.links } : cur));
      if (!pending.current) setSaveState('saved');
      if (job.draft.tags) refreshSide();
    } catch (e) {
      const newer = pending.current as { id: string; draft: NoteDraft } | null; // typed while this save was going
      pending.current = { id: job.id, draft: { ...job.draft, ...(newer?.id === job.id ? newer.draft : {}) } }; // keep it for the next try
      setSaveState('error');
      toast.error(`Could Not Save: ${message(e)}`);
    }
  }, [refreshSide]);

  const queue = useCallback((id: string, change: NoteDraft) => {
    pending.current = { id, draft: { ...(pending.current?.id === id ? pending.current.draft : {}), ...change } };
    setSaveState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS);
  }, [flush]);

  useEffect(() => () => { void flush(); }, [flush]); // leaving the screen sends what is waiting

  // Search waits a moment after typing; empty text shows the page or set again.
  useEffect(() => {
    const text = query.trim();
    if (!text) { setHits(null); setSearching(false); return undefined; }
    setSearching(true);
    let stale = false; // an older answer must not replace a newer one
    const wait = setTimeout(() => {
      searchNotes(text)
        .then((rows) => { if (!stale) setHits(rows); })
        .catch((e) => { if (!stale) { toast.error(message(e)); setHits([]); } })
        .finally(() => { if (!stale) setSearching(false); });
    }, 250);
    return () => { stale = true; clearTimeout(wait); };
  }, [query]);

  useEffect(() => {
    setRelated([]);
    if (!openId) { setNote(null); return; }
    relatedNotes(openId).then(setRelated).catch(() => undefined); // the page is useful without them
    getNote(openId).then((n) => {
      titles.current.set(n.id, n.title);
      setNote(n);
      // Names of the notes it links to, so the links read as titles.
      [...n.links, ...n.backlinks].filter((l) => !titles.current.has(l.id)).forEach((l) => {
        getNote(l.id).then((x) => { titles.current.set(x.id, x.title); setNote((cur) => (cur ? { ...cur } : cur)); }).catch(() => undefined);
      });
    }).catch((e) => toast.error(message(e)));
  }, [openId]);

  // While Phibe indexes, follow the progress.
  const busy = status?.index.state === 'running';
  useEffect(() => {
    if (!busy) return undefined;
    const poll = setInterval(() => {
      void notesStatus().then((s) => {
        setStatus(s);
        if (s.index.state !== 'running') {
          refreshAll();
          if (s.index.state === 'error') toast.error(s.index.error ?? 'Failed');
          else toast.success('Notes Are Up To Date');
        }
      });
    }, 1500);
    return () => clearInterval(poll);
  }, [busy, refreshAll]);

  const run = (start: () => Promise<unknown>) => {
    start().then(() => notesStatus()).then(setStatus).catch((e) => toast.error(message(e)));
  };

  const pick = async (id: string) => { await flush(); setEditing(false); setQuery(''); setOpenId(id); };
  const go = async (to: Scope) => { await flush(); setScope(to); setQuery(''); setOpenId(null); setEditing(false); setNewBookmark(null); setNewCollection(null); setPicked(new Set()); setSure(false); setViewing(null); setRenamingColl(null); setSureColl(false); };

  /** A note was made: show it in edit mode. */
  const show = (created: Note, edit: boolean) => {
    titles.current.set(created.id, created.title);
    setQuery('');
    setNote(created);
    setOpenId(created.id);
    setEditing(edit);
    refreshAll();
  };

  const startNew = async () => {
    await flush();
    try { show(await createNote({ title: '', body: '' }), true); } catch (e) { toast.error(message(e)); }
  };

  const startBookmark = async () => {
    const url = (newBookmark ?? '').trim();
    if (!url) { setNewBookmark(null); return; }
    await flush();
    try { show(await createBookmark(url), false); setNewBookmark(null); } catch (e) { toast.error(message(e)); }
  };

  const toggleTrash = async () => {
    if (!note) return;
    await flush();
    try {
      if (!note.deleted_at) await disintegrate(document.querySelector<HTMLElement>('.nt-page'));
      await (note.deleted_at ? restoreNote(note.id) : trashNote(note.id));
      toast.success(note.deleted_at ? 'Note Restored' : 'Moved To Trash');
      setEditing(false);
      setOpenId(null);
      refreshAll();
    } catch (e) { toast.error(message(e)); }
  };

  const changeCollections = async (ids: string[]) => {
    if (!note) return;
    try {
      const saved = await setNoteCollections(note.id, ids);
      setNote((cur) => (cur && cur.id === saved.id ? { ...cur, collections: saved.collections } : cur));
      refreshAll();
    } catch (e) { toast.error(message(e)); }
  };

  const edit = (change: NoteDraft) => {
    if (!note) return;
    setNote({ ...note, ...change });
    if (change.title !== undefined) titles.current.set(note.id, change.title);
    queue(note.id, change);
  };

  const mentionable = useMemo(() => catalog.filter((n) => n.id !== openId), [catalog, openId]);
  const progress = useMemo(() => {
    const job = status?.index.state === 'running' ? status.index : null;
    return job ? `Indexing ${job.done}/${job.total || '…'}` : null;
  }, [status]);
  const scopeTitle = scope.kind === 'all' ? 'All Notes' : scope.kind === 'bookmarks' ? 'Bookmarks' : scope.kind === 'pages' ? 'Pages' : scope.kind === 'collections' ? 'Collections' : scope.kind === 'files' ? 'Files' : scope.kind === 'images' ? 'Images' : scope.kind === 'videos' ? 'Videos' : scope.kind === 'tags' ? 'Tags' : scope.kind === 'trash' ? 'Trash' : scope.kind === 'graph' ? 'Graph' : scope.name;
  const scopeIcon: IconName = scope.kind === 'bookmarks' ? 'link-round' : scope.kind === 'collections' ? 'ph-folders' : scope.kind === 'files' ? 'lucide-files' : scope.kind === 'images' ? 'lucide-images' : scope.kind === 'videos' ? 'tabler-player-play' : scope.kind === 'tags' ? 'lucide-tags' : scope.kind === 'pages' ? 'document-text' : scope.kind === 'trash' ? 'trash-bin-2' : scope.kind === 'graph' ? 'ph-graph' : scope.kind === 'collection' ? 'folder' : scope.kind === 'tag' ? 'tag' : 'lucide-library';
  const canEdit = !!note && !note.deleted_at;

  const NavItem = ({ to, icon, label, count }: { to: Scope; icon: IconName; label: string; count?: number }) => (
    <button type="button" className="nt-nav" data-active={!openId && same(scope, to)} onClick={() => void go(to)}>
      <Icon name={icon} size={16} />
      <span className="truncate">{label}</span>
      {count !== undefined && <em>{count}</em>}
    </button>
  );

  /** One row of a list: icon, name, tags, date. Used by sets and by search results. */
  const Row = ({ id, kind, title, extra, date }: { id: string; kind: string; title: string; extra: string; date?: number }) => (
    <button type="button" role="listitem" className="nt-item" onClick={() => void pick(id)}>
      <Icon name={kind === 'bookmark' ? 'link-round' : 'document-text'} size={16} />
      <b className="truncate">{title || 'Untitled'}</b>
      <span className="nt-item-extra truncate">{extra}</span>
      {date !== undefined && <time>{whenText(date)}</time>}
    </button>
  );

  const known = tags.map((t) => t.name); // most used first
  useEffect(() => { setTagColors(Object.fromEntries(tags.filter((t) => t.color).map((t) => [t.name, t.color as string]))); }, [tags]);
  const changeNoteTags = (id: string, list: string[]) => { patchNote(id, { tags: list }).then(() => refreshAll()).catch((e) => toast.error(message(e))); };
  const changeFileLinks = (name: string, ids: string[]) => { setFileNotes(name, ids).then(() => refreshSide()).catch((e) => toast.error(message(e))); };
  const noteOptions = catalog.map((n) => ({ id: n.id, title: n.title })).filter((n) => n.title);
  const changeFileTags = (name: string, list: string[]) => { setFileTags(name, list).then(() => refreshSide()).catch((e) => toast.error(message(e))); };
  const isVideo = (a: { ext: string }) => VIDEO_EXT.includes(a.ext.toLowerCase());
  const files = attachments.filter((a) => !a.image && !isVideo(a));
  const images = attachments.filter((a) => a.image);
  const videos = attachments.filter(isVideo);
  const filesScope = scope.kind === 'files' || scope.kind === 'images' || scope.kind === 'videos';
  const togglePick = (key: string) => { setSure(false); setPicked((cur) => { const next = new Set(cur); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  useEffect(() => {
    if (picked.size === 0) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPicked(new Set()); setSure(false); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [picked]);

  /** Deletes what is ticked: notes go to the Trash, collections and files are removed (the notes in a collection stay). */
  const removePicked = async () => {
    const keys = [...picked];
    const hard = scope.kind === 'collections' || filesScope;
    if (hard && !sure) { setSure(true); return; }
    await Promise.all(keys.map((k) => disintegrate(document.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`))));
    try {
      for (const k of keys) await (scope.kind === 'collections' ? deleteCollection(k) : filesScope ? deleteNoteFile(k) : trashNote(k));
      toast.success(scope.kind === 'collections' ? 'Collections Deleted' : filesScope ? 'Files Deleted' : 'Moved To Trash');
    } catch (e) { toast.error(message(e)); }
    setPicked(new Set()); setSure(false);
    refreshAll();
  };

  const makeCollection = async () => {
    const name = (newCollection ?? '').trim();
    if (!name) { setNewCollection(null); return; }
    try { await createCollection(name); toast.success('Collection Added'); setNewCollection(null); refreshSide(); } catch (e) { toast.error(message(e)); }
  };

  const renameCurrent = () => {
    if (scope.kind !== 'collection') return;
    const name = (renamingColl ?? '').trim();
    setRenamingColl(null);
    if (!name || name === scope.name) return;
    renameCollection(scope.id, name).then(() => { setScope({ ...scope, name }); toast.success('Collection Renamed'); refreshSide(); }).catch((e) => toast.error(message(e)));
  };
  const deleteCurrent = () => {
    if (scope.kind !== 'collection') return;
    if (!sureColl) { setSureColl(true); return; }
    deleteCollection(scope.id).then(() => { toast.success('Collection Deleted'); void go({ kind: 'collections' }); refreshAll(); }).catch((e) => toast.error(message(e)));
  };
  const collectionTools = scope.kind === 'collection' && (
    <>
      {renamingColl === null
        ? <button type="button" className="nt-btn" onClick={() => setRenamingColl(scope.name)}><Icon name="edit" size={14} /> Rename</button>
        : <input autoFocus className="nt-add" value={renamingColl} aria-label="Collection Name" onChange={(e) => setRenamingColl(e.target.value)} onBlur={renameCurrent}
            onKeyDown={(e) => { if (e.key === 'Enter') renameCurrent(); if (e.key === 'Escape') setRenamingColl(null); }} />}
      <button type="button" className="nt-btn nt-danger" onClick={deleteCurrent} onBlur={() => setSureColl(false)}><Icon name="trash-bin-2" size={14} /> {sureColl ? 'Sure?' : 'Trash'}</button>
    </>
  );
  const sort = useSort(scope.kind);
  const heading = (
    <header className="nt-set-head">
      <h1><Icon name={scopeIcon} size={26} /> {scopeTitle}</h1>
      <p>{scope.kind === 'collections' ? `${collections.length} ${collections.length === 1 ? 'Collection' : 'Collections'}` : scope.kind === 'files' ? `${files.length} ${files.length === 1 ? 'File' : 'Files'}` : scope.kind === 'images' ? `${images.length} ${images.length === 1 ? 'Image' : 'Images'}` : scope.kind === 'videos' ? `${videos.length} ${videos.length === 1 ? 'Video' : 'Videos'}` : notes ? `${notes.length} ${notes.length === 1 ? 'Note' : 'Notes'}` : 'Loading…'}</p>
      {scope.kind !== 'trash' && (
        <div className="nt-set-actions">
          {SORTED.has(scope.kind) && <SortControl sort={sort} />}
          {filesScope ? (
            <>
              <button type="button" className="nt-btn nt-primary" onClick={() => setUploading(true)}><Icon name="upload-minimalistic" size={17} /> Upload</button>
            </>
          ) : scope.kind === 'collections' ? (
            newCollection === null
              ? <button type="button" className="nt-btn nt-primary" onClick={() => setNewCollection('')}><Icon name="add-circle" size={17} /> New Collection</button>
              : <input autoFocus className="nt-add nt-url" value={newCollection} placeholder="Insert a name to your collection" aria-label="Collection Name"
                  onChange={(e) => setNewCollection(e.target.value)} onBlur={() => { if (!newCollection.trim()) setNewCollection(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void makeCollection(); if (e.key === 'Escape') setNewCollection(null); }} />
          ) : scope.kind === 'bookmarks' && newBookmark !== null ? (
            <input
              autoFocus className="nt-add nt-url" value={newBookmark} placeholder="Paste an address link here" aria-label="Bookmark Address"
              onChange={(e) => setNewBookmark(e.target.value)} onBlur={() => { if (!newBookmark.trim()) setNewBookmark(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void startBookmark(); if (e.key === 'Escape') setNewBookmark(null); }}
            />
          ) : scope.kind === 'bookmarks' ? (
            <button type="button" className="nt-btn nt-primary" onClick={() => setNewBookmark('')}><Icon name="add-circle" size={17} /> New Bookmark</button>
          ) : (
            <>{collectionTools}<button type="button" className="nt-btn nt-primary" onClick={() => void startNew()}><Icon name="add-circle" size={17} /> New Page</button></>
          )}
        </div>
      )}
    </header>
  );

  return (
    <div className="nt-root">
      <aside className="nt-side" aria-label="Notes Navigation">
        <div className="nt-search">
          <Icon name="magnifer" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search Notes" />
          {query && <button type="button" aria-label="Clear Search" onClick={() => setQuery('')}><Icon name="close-circle" size={15} /></button>}
        </div>
        <NavItem to={{ kind: 'all' }} icon="lucide-library" label="All Notes" count={status?.notes} />
        <div className="nt-graphlink"><NavItem to={{ kind: 'graph' }} icon="ph-graph" label="Graph" /></div>
        <h4 className="nt-types-h">Types</h4>
        <div className="nt-types">
          <NavItem to={{ kind: 'bookmarks' }} icon="link-round" label="Bookmarks" count={status?.bookmarks} />
          <NavItem to={{ kind: 'collections' }} icon="ph-folders" label="Collections" count={collections.length} />
          <NavItem to={{ kind: 'files' }} icon="lucide-files" label="Files" count={files.length} />
          <NavItem to={{ kind: 'images' }} icon="lucide-images" label="Images" count={images.length} />
          <NavItem to={{ kind: 'pages' }} icon="document-text" label="Pages" count={status?.pages} />
          <NavItem to={{ kind: 'videos' }} icon="tabler-player-play" label="Videos" count={videos.length} />
          <NavItem to={{ kind: 'tags' }} icon="lucide-tags" label="Tags" count={tags.length} />
        </div>
        <div className="nt-state">
          {progress && <span className="nt-progress">{progress}</span>}
          <div className="nt-actions">
            <button type="button" className="nt-btn nt-index" disabled={busy || !status?.pending} onClick={() => run(() => reindexNotes(false))} title="Index the notes that changed">
              <Icon name="refresh" size={14} /> Index
            </button>
          </div>
        </div>
      </aside>

      <main className="nt-main" aria-label="Memoir">
        {query.trim() ? (
          <div className="nt-set">
            <header className="nt-set-head">
              <h1><Icon name="magnifer" size={26} /> {searching ? 'Searching…' : `${hits?.length ?? 0} Results`}</h1>
              <p>For “{query.trim()}”</p>
            </header>
            <div className="nt-items" role="list">
              {(hits ?? []).map((h) => <Row key={h.id} id={h.id} kind="page" title={h.title} extra={plainSnippet(h.snippet, h.title)} />)}
              {hits && hits.length === 0 && <p className="nt-empty">Nothing Found</p>}
            </div>
          </div>
        ) : !openId && scope.kind === 'graph' ? (
          <GraphView
            onOpenNote={(id) => void pick(id)}
            onOpenGroup={(n) => void go(n.type === 'tag' ? { kind: 'tag', name: n.label } : { kind: 'collection', id: n.id.replace('collection:', ''), name: n.label })}
          />
        ) : !openId && viewing ? (
          <FileView file={viewing} onClose={() => setViewing(null)} onOpenNote={(id) => { setViewing(null); void pick(id); }}
            onChanged={(gone, label) => { if (gone) setViewing(null); else setViewing((v) => (v ? { ...v, label: label ?? v.label } : v)); refreshSide(); }} />
        ) : !openId && scope.kind === 'tags' ? (
          <div className="nt-set">
            <TagsManager tags={tags} onOpen={(name) => void go({ kind: 'tag', name })} onChanged={refreshSide} />
          </div>
        ) : !openId || !note ? (
          <div className="nt-set">
            {(scope.kind === 'tag' || scope.kind === 'collection') && (
              <button type="button" className="nt-btn nt-return" onClick={() => void go({ kind: scope.kind === 'tag' ? 'tags' : 'collections' })}>← {scope.kind === 'tag' ? 'Tags' : 'Collections'}</button>
            )}
            {heading}
            {scope.kind === 'collections' ? (
              <CollectionsTable sort={sort.mode} rows={collections} picked={picked} onPick={togglePick} onOpen={(c) => void go({ kind: 'collection', id: c.id, name: c.name })} />
            ) : filesScope ? (
              <AttachmentsTable sort={sort.mode} onView={setViewing} noteOptions={noteOptions} onLinks={changeFileLinks} rows={scope.kind === 'images' ? images : scope.kind === 'videos' ? videos : files} picked={picked} onPick={togglePick} known={known} onTags={changeFileTags} onTag={(name) => void go({ kind: 'tag', name })} onOpen={(id) => void pick(id)} />
            ) : notes === null ? <p className="nt-empty">Loading…</p>
              : notes.length === 0 ? <p className="nt-empty">{scope.kind === 'trash' ? 'The Trash Is Empty' : 'No Notes Here Yet'}</p>
                : <NotesTable sort={sort.mode} dates={scope.kind === 'pages' ? 'updated' : 'none'} rows={notes} known={known} onTags={changeNoteTags} picked={picked} onPick={togglePick} onOpen={(id) => void pick(id)} onTag={(name) => void go({ kind: 'tag', name })} newLabel={scope.kind === 'bookmarks' ? 'New Bookmark' : 'New Page'} onNew={scope.kind === 'trash' ? undefined : scope.kind === 'bookmarks' ? () => setNewBookmark('') : () => void startNew()} />}
            {scope.kind === 'tag' && attachments.some((a) => a.tags?.includes(scope.name)) && (
              <>
                <h4 className="nt-types-h">Files With This Tag</h4>
                <AttachmentsTable onView={setViewing} noteOptions={noteOptions} onLinks={changeFileLinks} rows={attachments.filter((a) => a.tags?.includes(scope.name))} picked={picked} onPick={togglePick} selectable={false} known={known} onTags={changeFileTags} onTag={(name) => void go({ kind: 'tag', name })} onOpen={(id) => void pick(id)} />
              </>
            )}
          </div>
        ) : (
          <article className="nt-page" aria-label="Note">
            <div className="nt-bar">
              <button type="button" className="nt-crumb" onClick={() => void go(scope)}><Icon name={scopeIcon} size={14} /> {scopeTitle}</button>
              <span className="nt-crumb-sep">/</span>
              <span className="nt-crumb-now truncate">{note.title || 'Untitled'}</span>
              {note.deleted_at && <span className="nt-flag">In The Trash</span>}
              <span className="nt-grow" />
              {editing && <span className="nt-save" data-state={saveState}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Could Not Save' : 'Saved'}</span>}
              {canEdit && (
                <button type="button" className="nt-btn" onClick={() => { void flush(); setEditing(!editing); }}>
                  <Icon name={editing ? 'check-circle' : 'edit'} size={14} /> {editing ? 'Done' : 'Edit'}
                </button>
              )}
              <button type="button" className={`nt-btn${note.deleted_at ? '' : ' nt-danger'}`} onClick={() => void toggleTrash()}>
                <Icon name={note.deleted_at ? 'refresh' : 'trash-bin-2'} size={14} /> {note.deleted_at ? 'Restore' : 'Trash'}
              </button>
            </div>

            <div className="nt-column">
              {editing ? (
                <input className="nt-title-input" value={note.title} placeholder="Untitled" aria-label="Title" autoFocus={!note.title} onChange={(e) => edit({ title: e.target.value })} />
              ) : (
                <h1 className="nt-title">{note.title || 'Untitled'}</h1>
              )}

              <dl className="nt-props">
                <div>
                  <dt><Icon name="tag" size={14} /> Tags</dt>
                  <dd>
                    {editing ? <TagEditor tags={note.tags} known={tags} onChange={(t) => edit({ tags: t })} />
                      : note.tags.length === 0 ? <span className="nt-none">Empty</span>
                        : note.tags.map((t) => <button key={t} type="button" className="nt-chip" onClick={() => void go({ kind: 'tag', name: t })}>{t}</button>)}
                  </dd>
                </div>
                <div>
                  <dt><Icon name="folder" size={14} /> Collections</dt>
                  <dd>
                    {editing ? <CollectionEditor current={note.collections} all={collections} onChange={(ids) => void changeCollections(ids)} onCreate={createCollection} />
                      : note.collections.length === 0 ? <span className="nt-none">Empty</span>
                        : note.collections.map((c) => (
                          <button key={c.id} type="button" className="nt-chip" onClick={() => void go({ kind: 'collection', id: c.id, name: c.name })}><Icon name="folder" size={12} /> {c.name}</button>
                        ))}
                  </dd>
                </div>
                <div>
                  <dt><Icon name="add-circle" size={14} /> Created</dt>
                  <dd><span>{whenText(note.created_at)}</span></dd>
                </div>
                <div>
                  <dt><Icon name="clock-circle" size={14} /> Updated</dt>
                  <dd><span>{whenText(note.updated_at)}</span><span className="nt-none">{note.local_edit ? 'Edited Here' : 'Imported'}</span></dd>
                </div>
              </dl>

              {note.kind === 'bookmark' && (editing ? (
                <div className="nt-bookmark nt-fields">
                  <input value={note.url} placeholder="Address" aria-label="Address" onChange={(e) => edit({ url: e.target.value })} />
                  <textarea value={note.description} placeholder="Description" aria-label="Description" rows={3} onChange={(e) => edit({ description: e.target.value })} />
                </div>
              ) : (
                <div className="nt-bookmark">
                  {note.description && <p>{note.description}</p>}
                  {note.url && <a href={note.url} target="_blank" rel="noopener noreferrer"><Icon name="link-round" size={14} /> {note.url}</a>}
                </div>
              ))}

              {editing && note.kind === 'page' ? (
                <Suspense fallback={<p className="nt-empty">Loading Editor…</p>}>
                  <NoteEditor
                    key={note.id}
                    markdown={withoutTitle(note.body, note.title)}
                    upload={uploadNoteFile}
                    mentions={mentionable}
                    onChange={(md) => { setNote((cur) => (cur ? { ...cur, body: md } : cur)); queue(note.id, { body: md }); }}
                  />
                </Suspense>
              ) : note.body && (
                <div className="prose nt-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => {
                        const target = mentionedNoteId(href);
                        return target
                          ? <a href={href} className="nt-mention" onClick={(e) => { e.preventDefault(); void pick(target); }}>{children}</a>
                          : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                      },
                      // A picture that was never copied says so instead of failing.
                      img: ({ src, alt }) => (!src
                        ? <span className="nt-img-off"><Icon name="document-text" size={13} /> {alt || 'Image'} · Image Not Copied Yet</span>
                        : <img src={src} alt={alt ?? ''} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />),
                    }}
                    urlTransform={(url) => (mentionedNoteId(url) ? url : /^(https?:|mailto:|\/|#)/i.test(url) ? url : '')}
                  >{tidyMarkdown(withoutTitle(note.body, note.title))}</ReactMarkdown>
                </div>
              )}

              {!editing && (note.links.length > 0 || note.backlinks.length > 0) && (
                <div className="nt-links">
                  {([['Links', note.links], ['Backlinks', note.backlinks]] as const).filter(([, list]) => list.length > 0).map(([label, list]) => (
                    <section key={label}>
                      <h4>{label}</h4>
                      {list.map((l) => (
                        <button key={`${l.kind}-${l.id}`} type="button" className="nt-item" onClick={() => void pick(l.id)}>
                          <Icon name="document-text" size={16} />
                          <b className="truncate">{titles.current.get(l.id) || 'Open Note'}</b>
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              )}

              {!editing && related.length > 0 && (
                <div className="nt-links">
                  <section>
                    <h4>Related By Meaning</h4>
                    {related.map((r) => (
                      <button key={r.id} type="button" className="nt-item" onClick={() => void pick(r.id)}>
                        <Icon name={r.kind === 'bookmark' ? 'link-round' : 'document-text'} size={16} />
                        <b className="truncate">{r.title || 'Untitled'}</b>
                        <span className="nt-item-extra truncate">{r.shared.length ? `Also In ${r.shared.join(' · ')}` : ''}</span>
                        <time>{Math.round(r.score * 100)}%</time>
                      </button>
                    ))}
                  </section>
                </div>
              )}
            </div>
          </article>
        )}
        {picked.size > 0 && (
          <div className="nt-selbar" role="toolbar" aria-label="Selection">
            <b>{picked.size} Selected</b>
            <button type="button" className="nt-btn nt-danger" onClick={() => void removePicked()}>
              <Icon name="trash-bin-2" size={14} /> {sure ? 'Sure?' : scope.kind === 'collections' || filesScope ? 'Delete' : 'Trash'}
            </button>
            <button type="button" className="nt-btn" onClick={() => { setPicked(new Set()); setSure(false); }}>Clear</button>
          </div>
        )}
        {uploading && <FileUpload noun={scope.kind === 'images' ? 'Images' : scope.kind === 'videos' ? 'Videos' : 'Files'} onClose={() => setUploading(false)} onDone={refreshSide} />}
      </main>
    </div>
  );
}
