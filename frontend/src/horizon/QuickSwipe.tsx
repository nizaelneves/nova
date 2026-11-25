import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { HunchVoice } from '../components/memoir/HunchVoice';
import { listSwipe, readText, type SwipeLibrary, type SwipeVideo } from '../lib/swipe-api';
import './swipeWidget.css';

/** The island's Record button: speak a Hunch, with the same window as in Memoir (in Phibe's colours). */
export function RecordHunch({ onClose }: { onClose: () => void }) {
  const [threads, setThreads] = useState<string[] | null>(null);
  useEffect(() => {
    listSwipe('ideas').then((l) => setThreads([...new Set(l.items.flatMap((v) => v.threads ?? []))].sort((a, b) => a.localeCompare(b)))).catch(() => setThreads([]));
  }, []);
  if (threads === null) return null;
  return createPortal(<div className="hzs"><HunchVoice theme="phibe" inUse={threads} onClose={onClose} onDone={() => undefined} /></div>, document.body);
}

/** The island's Prompts button: a small list of titles; one click copies that prompt. */
export function PromptPicker({ onClose }: { onClose: () => void }) {
  const [lib, setLib] = useState<SwipeLibrary | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { listSwipe('prompts').then(setLib).catch(() => setLib({ folders: [], items: [] })); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const shown = useMemo(() => (lib?.items ?? [])
    .filter((v) => v.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title)), [lib, q]);
  const copy = async (v: SwipeVideo) => {
    try { await navigator.clipboard.writeText(await readText('prompts', v)); toast.success(`Copied ${v.title}`); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not copy'); }
  };
  return createPortal(
    <div className="hzs">
      <div className="hzs-qp-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="hzs-qp" role="dialog" aria-label="Prompts">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Prompts" aria-label="Search prompts"
            onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) void copy(shown[0]); }} />
          <ul>
            {lib === null ? <li className="hzs-qp-note">Opening…</li> : shown.length === 0 ? <li className="hzs-qp-note">No Prompts Found.</li>
              : shown.map((v) => <li key={`${v.folder}/${v.name}`}><button type="button" onClick={() => void copy(v)}><b>{v.title}</b><small>{v.folder}</small></button></li>)}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
