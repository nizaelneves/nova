import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { Forge } from './Forge';
import { useAppStore } from '../../lib/store';
import { transcribeAudio } from '../../lib/api';
import { streamChat } from '../../lib/sse';
import { saveText } from '../../lib/swipe-api';
import { ThreadPicker } from './Threads';
import { getShaper, getSpeechModel } from '../../lib/voice-notes';
import { isCliModel } from '../../lib/model-capabilities';

const PROMPT = `You turn a spoken thought into a clean note for a personal idea library.
Keep the speaker's language and meaning. Invent nothing: no advice, no suggestions, nothing the speaker did not say.
Reply with exactly this and nothing else:
# A short title
The note, as plain text.
Threads: the thread names, separated by commas.

The title goes on the first line after "# ", with no bold and no quotes.
The note is plain text, no bullet lists, no bold, no "Next steps". A short idea becomes one single paragraph that sums up everything that was said. Only a long idea (several different topics, or more than about 120 words) is split into parts, each with a short "## Heading" above it and still plain text.
The "Threads:" line only exists when the speaker asked to put the idea in a thread (for example "put it in the thread X" or "add it to X"). Then use the name the speaker gave, preferring the same name from the existing threads when it matches, and leave the request itself out of the note. When the speaker did not ask for a thread, leave the "Threads:" line out entirely.`;
const LIVE_EVERY = 3500; // while speaking, what has been said so far is written out again this often

/** Reads a streamed chat answer into one piece of text. */
async function ask(model: string, transcript: string, threads: string[], signal: AbortSignal): Promise<string> {
  let out = '';
  for await (const ev of streamChat({ model, stream: true, temperature: 0.3, plain: true, ...(isCliModel(model) ? { effort: useAppStore.getState().settings.cliEffort } : {}), messages: [{ role: 'system', content: `${PROMPT}
Existing threads: ${threads.slice(0, 40).join(', ') || 'none yet'}.` }, { role: 'user', content: transcript }] }, signal)) {
    if (ev.event) continue;
    try { out += (JSON.parse(ev.data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? ''; } catch { /* a chunk that is not text */ }
  }
  return out.trim();
}

/** Model ids read nicely: "llama3.1:8b" becomes "Llama 3.1 8b", "small" becomes "Small". */
const pretty = (id: string) => id.replace(/^ollama:/, '').replace(/([a-z])(\d)/gi, '$1 $2').replace(/[:_-]+/g, ' ').replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Listening: a grid of dots that swells outward from the middle, behind the button, like a pebble in water. */
function DotRipple() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, g = cv?.getContext('2d');
    if (!cv || !g) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 240 * dpr; cv.height = 150 * dpr; g.scale(dpr, dpr);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, t = 0, last = performance.now();
    const draw = (now: number) => {
      t += Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, 240, 150);
      for (let x = 0; x < 17; x++) for (let y = 0; y < 11; y++) {
        const d = Math.hypot(x - 8, y - 5), k = Math.max(0, Math.sin(d * 0.9 - t * 4));
        g.fillStyle = `hsla(${190 + d * 12},85%,${60 + k * 20}%,${0.22 + k * 0.7})`;
        g.beginPath(); g.arc(8 + x * 14, 10 + y * 13, 1 + k * 3, 0, 7); g.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="mm-ripple" style={{ width: 240, height: 150 }} aria-hidden="true" />;
}

/** A quiet timer of how long the wait has taken (same look as the one on the shaping screen). */
function Clock() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setS((v) => v + 1), 1000); return () => clearInterval(id); }, []);
  return <small className="mm-forge-time">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</small>;
}

type Phase ='idle' | 'recording' | 'writing' | 'transcript' | 'shaping' | 'review';

/**
 * Record a hunch: the words appear as you speak, you can fix them, a better model puts them in shape,
 * and you check the note before it is saved.
 */
export function HunchVoice({ inUse, onClose, onDone }: { inUse: string[]; onClose: () => void; onDone: () => void }) {
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const mentorModel = useAppStore((s) => s.selectedModel);
  const model = getShaper() || mentorModel;
  const [listen, setListen] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [threads, setThreads] = useState<string[]>([]);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number>(0);
  const inflight = useRef(false);
  const gone = useRef(false); // Discard was pressed: whatever is still running is dropped
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { getSpeechModel().then((m) => setListen(m.model)).catch(() => setListen('')); }, []);
  useEffect(() => { gone.current = false; return () => { gone.current = true; abort.current?.abort(); window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }; }, []);

  const text = async (): Promise<string> => (await transcribeAudio(new Blob(chunks.current, { type: 'audio/webm' }))).text.trim();

  const start = async () => {
    if (!speechEnabled) { toast.error('Enable speech in Settings first'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Microphone not supported in this browser'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      r.start(1000);
      rec.current = r;
      setTranscript('');
      setPhase('recording');
      timer.current = window.setInterval(() => { // live words: the audio so far is transcribed again, one at a time
        if (inflight.current || !chunks.current.length) return;
        inflight.current = true;
        text().then((t) => { if (rec.current?.state === 'recording') setTranscript(t); }).catch(() => { /* the final pass reports errors */ }).finally(() => { inflight.current = false; });
      }, LIVE_EVERY);
    } catch { toast.error('Could not use the microphone'); }
  };

  const stop = () => {
    const r = rec.current;
    if (!r) return;
    window.clearInterval(timer.current);
    setPhase('writing');
    r.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop());
      void (async () => {
        while (inflight.current) await new Promise((ok) => setTimeout(ok, 200));
        try { const t = await text(); if (gone.current) return; setTranscript(t); setPhase('transcript'); }
        catch (e) { if (gone.current) return; toast.error(e instanceof Error ? e.message : 'Transcription failed'); setPhase('idle'); }
      })();
    };
    r.stop();
  };

  const shape = async () => {
    if (!model) { toast.error('Pick a model in Settings first'); return; }
    setPhase('shaping');
    abort.current = new AbortController();
    try {
      const note = await ask(model, transcript, inUse, abort.current.signal);
      if (!note) throw new Error('The model sent nothing back');
      const t = /^Threads?:\s*(.+)$/im.exec(note);
      const clean = t ? note.replace(t[0], '').trim() : note;
      setThreads(t ? t[1].split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean).slice(0, 4) : []);
      const m = /^#\s+(.+)\n?/.exec(clean) ?? /^\*\*(.+?)\*\*\s*\n?/.exec(clean); // small models often bold the title instead
      setTitle(m ? m[1].trim() : transcript.slice(0, 40));
      setBody(m ? clean.slice(m[0].length).trim() : clean);
      setPhase('review');
    } catch (e) { if (gone.current) return; toast.error(e instanceof Error ? e.message : 'Could not shape the note'); setPhase('transcript'); }
  };

  const save = async () => {
    try { const r = await saveText('ideas', 'Unsorted', title.trim(), body, '', threads); toast.success('Hunch Saved'); onDone(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); }
  };

  const discard = () => { gone.current = true; abort.current?.abort(); window.clearInterval(timer.current); if (rec.current && rec.current.state !== 'inactive') { rec.current.onstop = null; rec.current.stop(); } rec.current?.stream.getTracks().forEach((t) => t.stop()); onClose(); };
  const recording = phase === 'recording', busy = phase === 'writing' || phase === 'shaping';
  return (
    <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !recording && !busy) onClose(); }}>
      <div className="mm-box mm-box-voice" role="dialog" aria-label="Record A Hunch">
        <button type="button" className="mm-x" aria-label="Close" onClick={discard}>×</button>
        {(phase === 'idle' || phase === 'recording' || phase === 'writing') && (
          <div className="mm-vc">
            {phase !== 'writing' && <div className="mm-vstage">
              {recording && <DotRipple />}
              <button type="button" className="mm-vmic" data-on={recording} aria-label={recording ? 'Stop' : 'Record'} onClick={() => (recording ? stop() : void start())}>
                <Icon name={recording ? 'stop-circle' : 'microphone'} size={30} />
              </button>
            </div>}
            {phase === 'writing' && <div className="mm-type" aria-hidden="true"><span>▒▒▒▒ ▒▒▒ ▒▒▒▒▒▒ ▒▒</span><span>▒▒ ▒▒▒▒▒ ▒▒▒ ▒▒▒▒</span><span>▒▒▒▒▒ ▒▒ ▒▒▒▒</span></div>}
            <p>{recording ? <>Listening…<small className="mm-stophint">Press To Stop</small></> : phase === 'writing' ? <>Transcribing<span className="mm-dots-text"><i>.</i><i>.</i><i>.</i></span></> : 'Press To Record'}</p>
            {phase === 'writing' && <Clock />}
            {(recording || phase === 'writing') && <div className="mm-heard" aria-live="polite">{transcript || (recording ? '…' : '')}</div>}
            <small>Listens [{pretty(listen ? `Whisper ${listen}` : 'Whisper')}] · Shapes [{model ? pretty(model) : 'No Model Yet'}]</small>
          </div>
        )}
        {phase === 'transcript' && (
          <>
            <label className="mm-fld"><span>Transcription</span><textarea className="mm-vtext" value={transcript} onChange={(e) => setTranscript(e.target.value)} autoFocus /></label>
          </>
        )}
        {phase === 'shaping' && (
          <Forge />
        )}
        {phase === 'review' && (
          <>
            <label className="mm-fld"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="mm-fld"><span>Note</span><textarea className="mm-vtext" value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <div className="mm-fld"><span>Threads</span><ThreadPicker value={threads} onChange={setThreads} inUse={inUse} /></div>
          </>
        )}
        <div className="mm-acts">
          {phase === 'transcript' && <>
            <button type="button" className="mm-btn mm-go" onClick={() => void shape()} disabled={!transcript.trim()}>Shape It</button>
            <button type="button" className="mm-btn" onClick={() => { setTranscript(''); setPhase('idle'); }}>Redo</button>
          </>}
          {phase === 'review' && <>
            <button type="button" className="mm-btn mm-go mm-save" onClick={() => void save()} disabled={!title.trim()}>Save</button>
            <button type="button" className="mm-btn" onClick={() => void shape()}>Shape It</button>
          </>}
          <button type="button" className="mm-btn mm-cancel" onClick={discard}>Discard</button>
        </div>
      </div>
    </div>
  );
}
