import { useRef, useState } from 'react';
import { formatDuration } from '../../lib/swipe-api';

const PLAY = 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z';
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
const VOLUME = 'M3 10v4h4l5 4V6L7 10H3Zm13.2-2.6a6.5 6.5 0 0 1 0 9.2l-1.4-1.4a4.5 4.5 0 0 0 0-6.4l1.4-1.4Z';
const MUTE = 'M3 10v4h4l5 4V6L7 10H3Zm12.4 .6 1.6 1.6 1.6-1.6 1.4 1.4-1.6 1.6 1.6 1.6-1.4 1.4-1.6-1.6-1.6 1.6-1.4-1.4 1.6-1.6-1.6-1.6 1.4-1.4Z';
const FULL = 'M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z';
const RATES = [0.5, 1, 1.5, 2];

const Glyph = ({ d, size = 18 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>;

/** The Swipe File's video player: a big play button, then a bar with seek, volume, speed and full screen. */
export function VideoPlayer({ src, autoPlay }: { src: string; autoPlay: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);

  const toggle = () => { const v = vid.current; if (v) { if (v.paused) void v.play(); else v.pause(); } };
  const seek = (to: number) => { if (vid.current) vid.current.currentTime = Math.max(0, Math.min(len, to)); };
  const mute = () => { if (vid.current) vid.current.muted = !vid.current.muted; };
  const full = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void box.current?.requestFullscreen(); };
  const faster = () => { const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; if (vid.current) vid.current.playbackRate = next; setRate(next); };
  const keys = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const map: Record<string, () => void> = { ' ': toggle, k: toggle, m: mute, f: full, ArrowRight: () => seek(t + 5), ArrowLeft: () => seek(t - 5) };
    const run = map[e.key];
    if (run) { e.preventDefault(); run(); }
  };

  return (
    <div className="mm-vp" ref={box} data-playing={playing} tabIndex={0} onKeyDown={keys}>
      <video ref={vid} src={src} autoPlay={autoPlay} playsInline onClick={toggle}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLen(e.currentTarget.duration || 0)} onDurationChange={(e) => setLen(e.currentTarget.duration || 0)}
        onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMuted(e.currentTarget.muted); }} />
      {!playing && <button type="button" className="mm-vp-big" aria-label="Play" onClick={toggle}><Glyph d={PLAY} size={34} /></button>}
      <div className="mm-vp-bar">
        <input type="range" className="mm-vp-seek" aria-label="Seek" min={0} max={len || 0} step={0.1} value={Math.min(t, len || 0)}
          style={{ '--p': `${len ? (t / len) * 100 : 0}%` } as React.CSSProperties} onChange={(e) => seek(parseFloat(e.target.value))} />
        <div className="mm-vp-row">
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}><Glyph d={playing ? PAUSE : PLAY} /></button>
          <span className="mm-vp-time">{formatDuration(t)} / {formatDuration(len)}</span>
          <span className="mm-vp-gap" />
          <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={mute}><Glyph d={muted || vol === 0 ? MUTE : VOLUME} /></button>
          <input type="range" className="mm-vp-vol" aria-label="Volume" min={0} max={1} step={0.05} value={muted ? 0 : vol}
            style={{ '--p': `${(muted ? 0 : vol) * 100}%` } as React.CSSProperties}
            onChange={(e) => { const v = vid.current; if (v) { v.volume = parseFloat(e.target.value); v.muted = false; } }} />
          <button type="button" className="mm-vp-rate" aria-label="Playback speed" onClick={faster}>{rate}×</button>
          <button type="button" aria-label="Full screen" onClick={full}><Glyph d={FULL} /></button>
        </div>
      </div>
    </div>
  );
}
