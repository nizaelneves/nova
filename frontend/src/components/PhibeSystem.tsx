import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clip, countChars, getMemoryState, getPersonaFiles, savePersonaFile, setMemoryMode, type MemoryMode, type MemoryState, type PersonaFile } from '../lib/personaFiles';
import { ApiKeyInput } from './keys';
import { Popup } from './Popup';

const FILES: { id: PersonaFile; file: string }[] = [
  { id: 'instructions', file: 'INSTRUCTIONS.md' },
  { id: 'soul', file: 'SOUL.md' },
  { id: 'user', file: 'USER.md' },
];

/** One file: a quiet card with its size; Edit opens the whole text in a pop-up, capped at what the prompt can hold. */
function FileEditor({ id, file, saved, limit, onSaved }: (typeof FILES)[number] & { saved: string; limit: number; onSaved: (text: string) => void }) {
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(saved), [saved]);
  const used = countChars(text);

  const save = async () => {
    setBusy(true);
    try {
      const done = await savePersonaFile(id, text);
      onSaved(done[id].text);
      toast.success(`${file} saved`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="set-section fin-card">
      <div className="flex items-center justify-between gap-4">
        <h3 className="set-inline-title">{file} · {countChars(saved).toLocaleString('en-US')} / {limit.toLocaleString('en-US')}</h3>
        <button type="button" className="set-btn" onClick={() => setOpen(true)}>Edit</button>
      </div>
      {open && (
        <Popup title={file} onClose={() => { setText(saved); setOpen(false); }} large hideTitle topGap={0}>
          <div className="ps-count" style={{ margin: '-4px 0 8px', height: 24, alignItems: 'center', justifyContent: 'flex-start', paddingRight: 36 }} data-full={used >= limit || undefined} data-near={used >= limit * 0.9 || undefined}>
            <b>{used.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}</b>
          </div>
          <textarea
            className="ps-text"
            style={{ minHeight: 'min(60vh, 520px)' }}
            value={text}
            spellCheck={false}
            autoFocus
            aria-label={file}
            onChange={(e) => setText(clip(e.target.value, limit))}
          />
          <div className="flex justify-end mt-3">
            <button type="button" className="set-btn" disabled={busy || text === saved} onClick={() => void save()}>{busy ? 'Saving' : 'Save'}</button>
          </div>
        </Popup>
      )}
    </div>
  );
}

const MEMORY_MODES: { id: MemoryMode; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'mem0', label: 'Mem0' },
];

/** Where Phibe keeps what it knows about you: the local file, or Mem0 with an API key. */
function MemoryCard() {
  const [state, setState] = useState<MemoryState | null>(null);
  useEffect(() => { getMemoryState().then(setState).catch(() => setState(null)); }, []);
  const change = async (next: MemoryMode) => {
    try { setState(await setMemoryMode(next)); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); }
  };
  if (!state) return null;
  const mode = state.mode;
  return (
    <div className="set-section fin-card">
      <div className="flex items-center justify-between gap-4">
        <h3 className="set-inline-title">Memory</h3>
        <select value={mode} onChange={(e) => void change(e.target.value as MemoryMode)} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          {MEMORY_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      {mode === 'mem0' && !state.installed && (
        <p className="text-xs mt-3" style={{ color: 'var(--color-error)' }}>The Mem0 SDK is not installed, so Phibe is still using USER.md. Install it with: pip install "phibe[mem0]"</p>
      )}
      {mode === 'mem0' && (
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Mem0 API key</span>
          <ApiKeyInput keyName="MEM0_API_KEY" placeholder="MEM0_API_KEY" toolName="mem0" />
        </div>
      )}
    </div>
  );
}

/** Settings, Phibe System: the two files that shape every answer, edited here. */
export function PhibeSystem() {
  const [files, setFiles] = useState<Awaited<ReturnType<typeof getPersonaFiles>> | null>(null);
  useEffect(() => { getPersonaFiles().then(setFiles).catch(() => setFiles(null)); }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="fin-wrap">
        <div className="set-grid">
          {files && FILES.map((f) => (
            <FileEditor key={f.id} {...f} saved={files[f.id].text} limit={files[f.id].limit}
              onSaved={(text) => setFiles({ ...files, [f.id]: { ...files[f.id], text } })} />
          ))}
          <MemoryCard />
          {!files && <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Could not read the files. Is the Phibe backend running?</p>}
        </div>
      </div>
    </div>
  );
}
