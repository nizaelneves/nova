import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clip, countChars, getPersonaFiles, getPromptPreview, getSourcesMode, savePersonaFile, setSourcesMode, type PersonaFile, type PromptSection, type SourcesMode } from '../lib/personaFiles';
import { Icon } from './Icon';
import { Popup } from './Popup';

const FILES: { id: PersonaFile; file: string; title: string }[] = [
  { id: 'instructions', file: 'INSTRUCTIONS.md', title: 'Base Instructions' },
  { id: 'soul', file: 'SOUL.md', title: 'Who Phibe Is' },
  { id: 'user', file: 'USER.md', title: 'Who You Are' },
];

const SECTION_NAME: Record<string, string> = { prefix: 'Prefix', agent_template: 'Base Instructions', soul: 'SOUL.md', user: 'USER.md', skill_catalog: 'Skills', skill_index: 'Skills', skill_examples: 'Skill Examples' };

/** One file: a text box that cannot go past the size the prompt can hold, and a Save button. */
function FileEditor({ id, file, title, saved, limit, onSaved }: (typeof FILES)[number] & { saved: string; limit: number; onSaved: (text: string) => void }) {
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(saved), [saved]);
  const used = countChars(text);

  const save = async () => {
    setBusy(true);
    try {
      const done = await savePersonaFile(id, text);
      onSaved(done[id].text);
      toast.success(`${file} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="set-section fin-card">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="set-inline-title">{title}</h3>
        <button type="button" className="set-btn" disabled={busy || text === saved} onClick={() => void save()}>{busy ? 'Saving' : 'Save'}</button>
      </div>
      <textarea
        className="ps-text"
        value={text}
        spellCheck={false}
        aria-label={file}
        onChange={(e) => setText(clip(e.target.value, limit))}
      />
      <div className="ps-count" data-full={used >= limit || undefined} data-near={used >= limit * 0.9 || undefined}>
        <span>{file}</span><b>{used.toLocaleString()} / {limit.toLocaleString()}</b>
      </div>
    </div>
  );
}

/** The system prompt as Phibe builds it now, section by section. */
function PromptView({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<{ sections: PromptSection[]; chars: number } | null>(null);
  useEffect(() => { getPromptPreview().then(setView).catch(() => setView({ sections: [], chars: 0 })); }, []);
  return (
    <Popup title="What Phibe Sees" onClose={onClose} wide>
      <div className="ps-prompt">
        {view?.sections.map((s) => (
          <section key={s.name}>
            <h5>{SECTION_NAME[s.name] ?? s.name}<span>{s.chars.toLocaleString()} chars</span></h5>
            <pre>{s.text}</pre>
          </section>
        ))}
        {view && <p className="fin-hint">{view.chars.toLocaleString()} characters in all, before your conversation and the memory found for each question.</p>}
      </div>
    </Popup>
  );
}

const SOURCES_MODES: { id: SourcesMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Phibe looks at your sources only when the question points at them (RSS, mail, calendar, drive, notes). Nothing is added otherwise.' },
  { id: 'always', label: 'Always', hint: 'Every question is searched against your sources. Uses more of the available context.' },
  { id: 'off', label: 'Off', hint: 'Chat never reads your sources.' },
];

/** Whether the chat may read the Knowledge index, at most about 600 tokens per answer. */
function SourcesInChat() {
  const [mode, setMode] = useState<SourcesMode | null>(null);
  useEffect(() => { getSourcesMode().then(setMode).catch(() => setMode(null)); }, []);
  const change = async (next: SourcesMode) => {
    try { setMode(await setSourcesMode(next)); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); }
  };
  if (!mode) return null;
  return (
    <div className="set-section fin-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="set-inline-title">Sources In Chat</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{SOURCES_MODES.find((m) => m.id === mode)?.hint}</p>
        </div>
        <select value={mode} onChange={(e) => void change(e.target.value as SourcesMode)} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          {SOURCES_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Settings, Phibe System: the two files that shape every answer, edited here. */
export function PhibeSystem() {
  const [files, setFiles] = useState<Awaited<ReturnType<typeof getPersonaFiles>> | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => { getPersonaFiles().then(setFiles).catch(() => setFiles(null)); }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="fin-wrap">
        <div className="set-grid">
          {files && FILES.map((f) => (
            <FileEditor key={f.id} {...f} saved={files[f.id].text} limit={files[f.id].limit}
              onSaved={(text) => setFiles({ ...files, [f.id]: { ...files[f.id], text } })} />
          ))}
          <SourcesInChat />
          {!files && <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Could not read the files. Is the Phibe backend running?</p>}
          <div>
            <button type="button" className="set-btn" onClick={() => setShowPrompt(true)}><Icon name="eye" size={13} /> What Phibe Sees</button>
          </div>
        </div>
      </div>
      {showPrompt && <PromptView onClose={() => setShowPrompt(false)} />}
    </div>
  );
}
