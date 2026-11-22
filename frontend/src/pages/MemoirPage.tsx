import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { listNotes } from '../lib/notes-api';
import { Icon } from '../components/Icon';
import { MemoryStatus } from '../components/memoir/MemoryStatus';
import { Sky } from '../components/memoir/Sky';
import { Mentor } from '../components/memoir/Mentor';
import { SwipeVideos } from '../components/memoir/SwipeVideos';
import { SwipeDocs } from '../components/memoir/SwipeDocs';
import { SwipeAudios } from '../components/memoir/SwipeAudios';
import { ConfigPanel } from '../components/memoir/ConfigPanel';
import { TrashPanel } from '../components/memoir/TrashPanel';
import { NotesPage } from './NotesPage';
import { memoirMark } from '../lib/memoirMark';
import { AtomIcon } from '../components/memoir/AtomIcon';
import { leaveMemoir, useMemoirReveal } from '../lib/memoirTransition';
import { KINDS, listSwipe, listTrash, listTypes, type SwipeKind, type SwipeLibrary, type TextType } from '../lib/swipe-api';

type Section = 'notes' | 'config' | 'trash' | SwipeKind;
const NONE: SwipeLibrary = { folders: [], items: [] };
const SAVED = 'memoir.section';
const NAV_ICON = { videos: 'play-stream', audios: 'music-notes', texts: 'writing-sign', prompts: 'terminal-window', ideas: 'lightbulb-bolt' } as const;
const NAV_NAME: Record<string, string> = { videos: 'Videos', audios: 'Audios', texts: 'Copies', prompts: 'Prompts', ideas: 'Hunches' };
const read = (): Section => { try { const v = localStorage.getItem(SAVED) as Section; return v === 'videos' || v === 'audios' || v === 'texts' || v === 'prompts' || v === 'ideas' || v === 'config' || v === 'trash' ? v : 'notes'; } catch { return 'notes'; } };

/**
 * Memoir: a space of its own, apart from the rest of Phibe (no sidebar, no island). Notes live here, and so does the
 * Swipe File: folders of videos kept on disk that can be watched right here. Phibe is the mentor, in the floating button.
 */
export function MemoirPage() {
  const navigate = useNavigate();
  const revealed = useMemoirReveal();
  const [section, setSection] = useState<Section>(read);
  const [folder, setFolder] = useState('All');
  const [libs, setLibs] = useState<Partial<Record<SwipeKind, SwipeLibrary>>>({});
  const kind = section === 'notes' || section === 'config' || section === 'trash' ? null : section;
  const [trashed, setTrashed] = useState(0);
  const countTrash = useCallback(() => { void Promise.all([listTrash().catch(() => []), listNotes({ trashed: true }).catch(() => [])]).then(([a, b]) => setTrashed(a.length + b.length)); }, []);
  useEffect(() => { countTrash(); }, [countTrash, section]);
  const lib = (kind && libs[kind]) || NONE;
  const [types, setTypes] = useState<TextType[]>([]);
  /** Every text type read and put in one library: each item knows its type, and the folders are the sources. */
  const loadTexts = useCallback(async () => {
    const list = await listTypes();
    setTypes(list);
    const libsOf = await Promise.all(list.map((t) => listSwipe(t.id).then((l) => ({ t, l }))));
    const items = libsOf.flatMap(({ t, l }) => l.items.map((i) => ({ ...i, type: t.id }))).sort((a, b) => b.modified - a.modified);
    const counts = new Map<string, number>();
    items.forEach((i) => counts.set(i.folder, (counts.get(i.folder) ?? 0) + 1));
    const folders = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)); // texts have no folders on screen: only the Source of each
    setLibs((p) => ({ ...p, texts: { folders, items } }));
  }, []);
  const reload = useCallback(() => {
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not read the Swipe File');
    if (kind === 'texts') loadTexts().catch(fail);
    else if (kind) listSwipe(kind).then((l) => setLibs((p) => ({ ...p, [kind]: l }))).catch(fail);
  }, [kind, loadTexts]);

  // every kind is read, so the side menu can show all the counts, not only those of the screen that is open
  const reloadAll = useCallback(() => {
    (Object.keys(KINDS) as SwipeKind[]).forEach((k) => { listSwipe(k).then((l) => setLibs((p) => ({ ...p, [k]: l }))).catch(() => { /* the open screen reports its own error */ }); });
    loadTexts().catch(() => { /* the open screen reports its own error */ });
  }, [loadTexts]);
  useEffect(() => { reloadAll(); addEventListener('focus', reloadAll); return () => removeEventListener('focus', reloadAll); }, [reloadAll]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setFolder('All'); }, [kind]);
  useEffect(() => { try { localStorage.setItem(SAVED, section); } catch { /* not remembered */ } }, [section]);
  useEffect(() => { // a folder that no longer exists on disk falls back to All
    if (folder !== 'All' && lib.folders.length && !lib.folders.some((f) => f.name === folder)) setFolder('All');
  }, [lib, folder]);

  const rise = (n: number) => ({ '--n': n } as React.CSSProperties);
  return (
    <div className={`mm-root ${revealed ? 'mm-live' : 'mm-hold'}`}>
      <div className="mm-neb mm-n1" /><div className="mm-neb mm-n2" /><div className="mm-neb mm-n3" />
      <Sky />

      <header className="mm-top mm-rise" style={rise(0)}>
        <div className="mm-brand"><AtomIcon size={22} /><span className="mm-mark" dangerouslySetInnerHTML={{ __html: memoirMark('mk-head') }} /></div>
        <div className="mm-grow" />
        <button type="button" className="mm-back" onClick={() => void leaveMemoir(navigate)}><span className="mm-arrow">←</span><span className="mm-word">phi<b>be</b></span></button>
      </header>

      <aside className="mm-side mm-rise" style={rise(1)} aria-label="Memoir Navigation">
        <h6>Hub</h6>
        <button type="button" className="mm-nav" data-on={section === 'notes'} onClick={() => setSection('notes')}><Icon name="brain-cog" size={21} />Brain</button>
        <button type="button" className="mm-nav" data-on={section === 'trash'} onClick={() => setSection('trash')}><Icon name="recycle" size={21} />Trash{trashed > 0 && <em>{trashed}</em>}</button>
        <h6>Swipe File</h6>
        {(Object.keys(NAV_NAME) as SwipeKind[]).sort((a, b) => NAV_NAME[a].localeCompare(NAV_NAME[b])).map((k) => (
          <button key={k} type="button" className="mm-nav" data-on={section === k} onClick={() => { setSection(k); setFolder('All'); }}>
            <Icon name={NAV_ICON[k as keyof typeof NAV_ICON]} size={21} />{NAV_NAME[k]}{libs[k] && <em>{libs[k]!.items.length}</em>}
          </button>
        ))}
        <button type="button" className="mm-nav mm-cfg-nav" data-on={section === 'config'} onClick={() => setSection('config')}><Icon name="sliders" size={21} />Settings</button>
        <MemoryStatus />
      </aside>

      <main className={`mm-main mm-rise${section === 'notes' ? ' mm-fit' : ''}`} style={rise(2)}>
        {section === 'notes' ? <NotesPage /> : section === 'config' ? <ConfigPanel /> : section === 'trash' ? <TrashPanel onChange={() => { countTrash(); reloadAll(); }} /> : section === 'videos'
          ? <SwipeVideos lib={lib} folder={folder} setFolder={setFolder} reload={reload} />
          : section === 'audios' ? <SwipeAudios lib={lib} folder={folder} setFolder={setFolder} reload={reload} />
          : <SwipeDocs key={section} kind={section} lib={lib} folder={folder} setFolder={setFolder} reload={reload} types={types} reloadTypes={() => { void loadTexts(); }} />}
      </main>

      <Mentor />
    </div>
  );
}
