import { Dates, SortControl, sortRows, useSort } from './SortControl';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { UploadDialog } from './UploadDialog';
import { EditButton, EditDialog, TrashButton } from './EditDialog';
import { FolderTitle } from './Threads';
import { VideoPlayer } from './VideoPlayer';
import { formatDuration, formatSize, getAutoPlay, videoUrl, type SwipeLibrary, type SwipeVideo } from '../../lib/swipe-api';

const key = (v: SwipeVideo) => `${v.folder}/${v.name}`;
// Thumbnails are made once per video, a few at a time and only for what is on screen: one frame is drawn to a small image
// and the <video> is let go. (Hundreds of <video> elements at once froze the page.)
interface Still { src?: string; length?: number }
const stills = new Map<string, Still>();
let running = 0;
const waiting: (() => void)[] = [];
const pump = () => { while (running < 2 && waiting.length) { running += 1; waiting.shift()!(); } };
const done = () => { running -= 1; pump(); };

function makeStill(v: SwipeVideo): Promise<Still> {
  return new Promise((resolve) => {
    waiting.push(() => {
      const el = document.createElement('video');
      el.muted = true; el.preload = 'metadata'; el.playsInline = true;
      let over = false;
      const finish = (still: Still) => {
        if (over) return;
        over = true; clearTimeout(timer);
        el.removeAttribute('src'); el.load(); // let go of the file
        done(); resolve(still);
      };
      const timer = setTimeout(() => finish({}), 10000);
      el.onerror = () => finish({});
      el.onloadedmetadata = () => {
        if (el.duration > 2) el.currentTime = 0.8; // a frame past the opening black
        else finish({ length: el.duration });
      };
      el.onseeked = () => {
        const length = el.duration;
        try {
          const w = 320, h = Math.round((w * el.videoHeight) / Math.max(1, el.videoWidth));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(el, 0, 0, w, h);
          finish({ src: c.toDataURL('image/jpeg', 0.7), length });
        } catch { finish({ length }); }
      };
      el.src = videoUrl(v);
    });
    pump();
  });
}

function Thumb({ v, big }: { v: SwipeVideo; big?: boolean }) {
  const [still, setStill] = useState(stills.get(key(v)));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (still) return undefined;
    const el = box.current;
    if (!el) return undefined;
    let gone = false;
    const look = new IntersectionObserver(([hit]) => {
      if (!hit.isIntersecting) return;
      look.disconnect();
      void makeStill(v).then((r) => { stills.set(key(v), r); if (!gone) setStill(r); });
    }, { rootMargin: '300px' });
    look.observe(el);
    return () => { gone = true; look.disconnect(); };
  }, [v, still]);
  return (
    <div className="mm-thumb" ref={box}>
      {still?.src && <img src={still.src} alt="" draggable={false} />}
      {!big && <span className="mm-play"><i /></span>}
      {still?.length !== undefined && <span className="mm-dur">{formatDuration(still.length)}</span>}
    </div>
  );
}

/** The Swipe File's videos: a library of folders on disk, and a player. Videos are read straight from the folder. */
export function SwipeVideos({ lib, folder, setFolder, reload }: {
  lib: SwipeLibrary; folder: string; setFolder: (f: string) => void; reload: () => void;
}) {
  const [playing, setPlaying] = useState<SwipeVideo | null>(null);
  const [upload, setUpload] = useState<File[] | null>(null);
  const [drag, setDrag] = useState(false);
  const [edit, setEdit] = useState<SwipeVideo | null>(null);
  const sort = useSort('videos');
  const shown = sortRows((folder === 'All' ? lib.items : lib.items.filter((v) => v.folder === folder)), sort.mode, (v) => v.title, (v) => v.created ?? v.modified);

  useEffect(() => {
    if (!playing) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(null); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [playing]);

  const tilt = (e: React.PointerEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.mm-thumb'); if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--rx', `${(((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(1)}deg`);
    t.style.setProperty('--ry', `${((0.5 - (e.clientY - r.top) / r.height) * 8).toFixed(1)}deg`);
  };
  const untilt = (e: React.PointerEvent) => { const t = (e.target as HTMLElement).closest<HTMLElement>('.mm-thumb'); t?.style.setProperty('--rx', '0deg'); t?.style.setProperty('--ry', '0deg'); };

  const dialog = upload && (
    <UploadDialog kind="videos" folders={lib.folders} folder={folder} files={upload} onClose={() => setUpload(null)} onDone={(f) => { reload(); setFolder(f); }} />
  );

  if (playing) {
    const more = lib.items.filter((v) => v.folder === playing.folder && key(v) !== key(playing)).slice(0, 6);
    return (
      <div className="mm-pad mm-swap">
        <button type="button" className="mm-btn" onClick={() => setPlaying(null)}>← Return</button>
        <div className="mm-watch">
          <div>
            <div className="mm-scr"><div className="mm-amb" /><VideoPlayer key={key(playing)} src={videoUrl(playing)} autoPlay={getAutoPlay()} /></div>
            <h3>{playing.title}</h3>
            <small>{playing.folder} · {formatSize(playing.size)}</small>
            <Dates created={playing.created ?? playing.modified} />
          </div>
          <div className="mm-next">
            {more.length > 0 && <h5>More In This Folder</h5>}
            {more.map((v, i) => (
              <button key={key(v)} type="button" className="mm-nx" style={{ '--i': i } as React.CSSProperties} onClick={() => setPlaying(v)}>
                <Thumb v={v} big /><div><b>{v.title}</b><small>{v.folder}</small></div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mm-pad mm-swap"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); setUpload([...e.dataTransfer.files]); }}>
      {drag && <div className="mm-drop">Drop Videos To Add Them To {folder === 'All' ? 'The Swipe File' : folder}</div>}
      <div className="mm-chips">
        {['All', ...lib.folders.map((f) => f.name)].map((f) => (
          <button key={f} type="button" className="mm-chip" data-on={f === folder} onClick={() => setFolder(f)}>{f}</button>
        ))}
      </div>
      <div className="mm-head">
        <FolderTitle kind="videos" folder={folder} text={folder === 'All' ? 'All Videos' : folder} onRenamed={setFolder} /><span>{shown.length} {shown.length === 1 ? 'Video' : 'Videos'}</span>
        <SortControl sort={sort} />
        <button type="button" className="mm-btn mm-go mm-up" onClick={() => setUpload([])}><Icon name="upload-minimalistic" size={15} />Upload</button>
      </div>
      {shown.length === 0 ? (
        <div className="mm-empty">
          <b>No Videos Yet</b>
        </div>
      ) : (
        <div className="mm-grid" onPointerMove={tilt} onPointerOut={untilt}>
          {shown.map((v, i) => (
            <div key={key(v)} className="mm-ed">
              <button type="button" className="mm-vid" style={{ '--i': Math.min(i, 14) } as React.CSSProperties} onClick={() => setPlaying(v)}>
                <Thumb v={v} /><b>{v.title}</b><small>{v.folder} · {formatSize(v.size)}</small><Dates created={v.created ?? v.modified} />
              </button>
              <EditButton label={v.title} onEdit={() => setEdit(v)} />
              <TrashButton kind="videos" item={v} folders={lib.folders} onDone={(f) => { reload(); setFolder(f); }} />
            </div>
          ))}
        </div>
      )}
      {dialog}
      {edit && <EditDialog kind="videos" item={edit} folders={lib.folders} onClose={() => setEdit(null)} onDone={(f) => { reload(); setFolder(f); }} />}
    </div>
  );
}
