import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { UploadDialog } from './UploadDialog';
import { EditButton, EditDialog, TrashButton } from './EditDialog';
import { FolderTitle } from './Threads';
import { fileUrl, formatDuration, formatSize, type SwipeLibrary, type SwipeVideo } from '../../lib/swipe-api';

const key = (v: SwipeVideo) => `${v.folder}/${v.name}`;
const SAVED = 'memoir.audio';
const RATES = [0.75, 1, 1.25, 1.5, 2];
const readSaved = (): { volume: number; rate: number } => {
  try { const o = JSON.parse(localStorage.getItem(SAVED) ?? '{}'); return { volume: typeof o.volume === 'number' ? Math.min(1, Math.max(0, o.volume)) : 1, rate: RATES.includes(o.rate) ? o.rate : 1 }; }
  catch { return { volume: 1, rate: 1 }; }
};

// Lengths are read from the files themselves, a couple at a time and only for rows on screen.
const lengths = new Map<string, number>();
let running = 0;
const waiting: (() => void)[] = [];
const pump = () => { while (running < 2 && waiting.length) { running += 1; waiting.shift()!(); } };
function readLength(v: SwipeVideo): Promise<number> {
  return new Promise((resolve) => {
    waiting.push(() => {
      const el = new Audio();
      el.preload = 'metadata';
      const finish = (n: number) => { clearTimeout(timer); el.removeAttribute('src'); el.load(); running -= 1; pump(); resolve(n); };
      const timer = setTimeout(() => finish(NaN), 8000);
      el.onloadedmetadata = () => finish(el.duration);
      el.onerror = () => finish(NaN);
      el.src = fileUrl('audios', v);
    });
    pump();
  });
}

function Length({ v }: { v: SwipeVideo }) {
  const [n, setN] = useState(lengths.get(key(v)));
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (n !== undefined || !box.current) return undefined;
    let gone = false;
    const look = new IntersectionObserver(([hit]) => {
      if (!hit.isIntersecting) return;
      look.disconnect();
      void readLength(v).then((d) => { lengths.set(key(v), d); if (!gone) setN(d); });
    }, { rootMargin: '200px' });
    look.observe(box.current);
    return () => { gone = true; look.disconnect(); };
  }, [v, n]);
  return <span ref={box} className="mm-alen">{n !== undefined ? formatDuration(n) : ''}</span>;
}

const Glyph = ({ d, size = 18 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>;
const PLAY = 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z';
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
const PREV = 'M6 5h2v14H6zM19 5.6v12.8a.8.8 0 0 1-1.25.66L9.5 12.66a.8.8 0 0 1 0-1.32l8.25-5.4A.8.8 0 0 1 19 5.6Z';
const NEXT = 'M16 5h2v14h-2zM5 5.6v12.8a.8.8 0 0 0 1.25.66l8.25-5.4a.8.8 0 0 0 0-1.32l-8.25-5.4A.8.8 0 0 0 5 5.6Z';

/** The Swipe File's audios: spots and clips kept in folders on disk, with a player that plays on through the list. */
export function SwipeAudios({ lib, folder, setFolder, reload }: {
  lib: SwipeLibrary; folder: string; setFolder: (f: string) => void; reload: () => void;
}) {
  const shown = folder === 'All' ? lib.items : lib.items.filter((v) => v.folder === folder);
  const [now, setNow] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [total, setTotal] = useState(0);
  const [upload, setUpload] = useState<File[] | null>(null);
  const [drag, setDrag] = useState(false);
  const [edit, setEdit] = useState<SwipeVideo | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const saved = useRef(readSaved());
  const [volume, setVolume] = useState(saved.current.volume);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(saved.current.rate);
  useEffect(() => { // volume and speed hold from track to track, and between visits
    const a = audio.current;
    if (a) { a.volume = volume; a.muted = muted; a.playbackRate = rate; a.defaultPlaybackRate = rate; }
    try { localStorage.setItem(SAVED, JSON.stringify({ volume, rate })); } catch { /* not remembered */ }
  }, [volume, muted, rate, now]);

  const index = shown.findIndex((v) => key(v) === now);
  const current = index >= 0 ? shown[index] : null;
  const go = (n: number) => { const v = shown[n]; if (v) setNow(key(v)); };
  const toggle = (v: SwipeVideo) => {
    if (key(v) === now) { const a = audio.current; if (a) void (a.paused ? a.play() : a.pause()); }
    else setNow(key(v));
  };

  useEffect(() => { // a new track starts as soon as it is picked
    const a = audio.current;
    if (!a || !current) return;
    a.src = fileUrl('audios', current);
    void a.play().catch(() => setPlaying(false));
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mm-pad mm-swap mm-audio"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); setUpload([...e.dataTransfer.files]); }}>
      {drag && <div className="mm-drop">Drop Audios To Add Them To {folder === 'All' ? 'The Swipe File' : folder}</div>}
      <div className="mm-chips">
        {['All', ...lib.folders.map((f) => f.name)].map((f) => <button key={f} type="button" className="mm-chip" data-on={f === folder} onClick={() => setFolder(f)}>{f}</button>)}
      </div>
      <div className="mm-head">
        <FolderTitle kind="audios" folder={folder} text={folder === 'All' ? 'All Audios' : folder} onRenamed={setFolder} /><span>{shown.length} {shown.length === 1 ? 'Audio' : 'Audios'}</span>
        <button type="button" className="mm-btn mm-go mm-up" onClick={() => setUpload([])}><Icon name="upload-minimalistic" size={15} />Upload</button>
      </div>

      {shown.length === 0 ? (
        <div className="mm-empty"><b>No Audios Yet</b></div>
      ) : (
        <div className="mm-grid mm-docs">
          {shown.map((v, i) => {
            const on = key(v) === now;
            return (
              <div key={key(v)} className="mm-ed">
                <div className="mm-card mm-acard" role="button" tabIndex={0} data-on={on} data-playing={on && playing} onClick={() => toggle(v)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(v); } }}
                  style={{ '--i': Math.min(i, 14), '--p': on && total > 0 ? `${(time / total) * 100}%` : '0%' } as React.CSSProperties}>
                  <span className="mm-tplay" aria-label={on && playing ? `Pause ${v.title}` : `Play ${v.title}`}><Glyph d={on && playing ? PAUSE : PLAY} /></span>
                  <b>{v.title}</b>
                  <small className="mm-cfoot"><span>{v.folder}</span><Length v={v} /><span>{formatSize(v.size)}</span><span className="mm-eq" aria-hidden="true"><i /><i /><i /><i /></span></small>
                </div>
                <EditButton label={v.title} onEdit={() => setEdit(v)} />
                <TrashButton kind="audios" item={v} folders={lib.folders} onDone={(f) => { if (on) { audio.current?.pause(); setNow(null); } reload(); setFolder(f); }} />
              </div>
            );
          })}
        </div>
      )}

      <audio ref={audio} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setTotal(e.currentTarget.duration)}
        onEnded={() => { if (index >= 0 && index < shown.length - 1) go(index + 1); else setPlaying(false); }} />

      {current && (
        <div className="mm-bar" role="region" aria-label="Player">
          <button type="button" className="mm-bar-x" aria-label="Close Player" onClick={() => { audio.current?.pause(); setNow(null); setPlaying(false); setTime(0); }}>×</button>
          <div className="mm-bar-info"><b>{current.title}</b><small>{current.folder}</small></div>
          <div className="mm-bar-ctl">
            <button type="button" aria-label="Previous" disabled={index <= 0} onClick={() => go(index - 1)}><Glyph d={PREV} size={16} /></button>
            <button type="button" className="mm-bar-main" aria-label={playing ? 'Pause' : 'Play'} onClick={() => toggle(current)}><Glyph d={playing ? PAUSE : PLAY} size={20} /></button>
            <button type="button" aria-label="Next" disabled={index >= shown.length - 1} onClick={() => go(index + 1)}><Glyph d={NEXT} size={16} /></button>
          </div>
          <div className="mm-bar-seek">
            <span>{formatDuration(time)}</span>
            <input type="range" min={0} max={Number.isFinite(total) && total > 0 ? total : 0} step={0.1} value={Math.min(time, total || 0)} aria-label="Seek"
              style={{ '--p': `${total > 0 ? (time / total) * 100 : 0}%` } as React.CSSProperties}
              onChange={(e) => { const a = audio.current; if (a) a.currentTime = parseFloat(e.target.value); }} />
            <span>{Number.isFinite(total) ? formatDuration(total) : ''}</span>
          </div>
          <div className="mm-bar-extra">
            <button type="button" className="mm-vol" data-muted={muted || volume === 0} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}><Icon name="volume-loud" size={18} /></button>
            <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume" style={{ '--p': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }} />
            <button type="button" className="mm-rate" aria-label={`Speed ${rate}×`} onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}>{rate}×</button>
          </div>
        </div>
      )}
      {edit && <EditDialog kind="audios" item={edit} folders={lib.folders} onClose={() => setEdit(null)} onDone={(f) => { if (key(edit) === now) { audio.current?.pause(); setNow(null); } reload(); setFolder(f); }} />}
      {upload && <UploadDialog kind="audios" folders={lib.folders} folder={folder} files={upload} onClose={() => setUpload(null)} onDone={(f) => { reload(); setFolder(f); }} />}
    </div>
  );
}
