import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useAppStore } from '../../lib/store';
import { CLI_ENGINES_ENABLED } from '../../lib/features';
import { EFFORT_LABELS, EFFORT_LEVELS, isCliModel, isEmbedOnlyModel } from '../../lib/model-capabilities';
import { CLAUDE_MODELS, CODEX_MODELS } from '../Chat/EngineMenu';
import { SPEECH_SIZES, downloadSpeechModel, getShaper, listSpeechModels, setShaper, setSpeechModel, type SpeechModel } from '../../lib/voice-notes';
import { toast } from 'sonner';

const short = (id: string) => id.replace(/^ollama:/, '');

/** Reasoning effort: only the command-line engines (Claude Code and Codex) take one, so it sits under them. One setting for both. */
function Effort() {
  const effort = useAppStore((s) => s.settings.cliEffort);
  const update = useAppStore((s) => s.updateSettings);
  return (
    <label className="mm-effort"><span>Effort<em>{EFFORT_LABELS[effort]}</em></span>
      <input type="range" min={0} max={EFFORT_LEVELS.length - 1} step={1} value={Math.max(0, EFFORT_LEVELS.indexOf(effort))} aria-label="Reasoning effort"
        onChange={(e) => update({ cliEffort: EFFORT_LEVELS[parseInt(e.target.value, 10)] })} />
    </label>
  );
}

/** The model the Mentor answers with: local models, cloud models and the command-line engines, in one list. */
function ModelChoices() {
  const models = useAppStore((s) => s.models);
  const current = useAppStore((s) => s.selectedModel);
  const setModel = useAppStore((s) => s.setSelectedModel);
  const chat = models.filter((m) => !isEmbedOnlyModel(m.id) && !isCliModel(m.id));
  const local = chat.filter((m) => m.owned_by !== 'litellm'), cloud = chat.filter((m) => m.owned_by === 'litellm');
  const row = (id: string, text: string, note?: string) => (
    <button key={id} type="button" className="mm-mrow" data-on={id === current} onClick={() => setModel(id)}>
      <span><b>{text}</b>{note && <small>{note}</small>}</span>{id === current && <Icon name="check-circle" size={16} />}
    </button>
  );
  return (
    <div className="mm-choices">
      <div><h6>Local</h6>{local.length ? local.map((m) => row(m.id, short(m.id))) : <p>No Local Models</p>}</div>
      <div><h6>Cloud</h6>{cloud.length ? cloud.map((m) => row(m.id, short(m.id))) : <p>Add a Cloud Key In Settings</p>}</div>
      {CLI_ENGINES_ENABLED && <>
        <div><h6>Claude Code</h6>{CLAUDE_MODELS.map((m) => row(m.id, m.label, m.note))}<Effort /></div>
        <div><h6>Codex</h6>{CODEX_MODELS.map((m) => row(m.id, m.label, m.note))}<Effort /></div>
      </>}
    </div>
  );
}

/** One choice at a time: ‹ name › steps through the list, with its place in it (3 / 5) at the side. */
function Stepper({ count, index, label, note, have, onStep }: { count: number; index: number; label: string; note: string; have?: boolean; onStep: (i: number) => void }) {
  const go = (d: number) => { if (count > 0) onStep((index + d + count) % count); };
  return (
    <div className="mm-step">
      <button type="button" aria-label="Previous" disabled={count < 2} onClick={() => go(-1)}>‹</button>
      <div className="mm-step-now" data-have={have}><b>{label}</b>{note && <small>{note}</small>}</div>
      <em>{count ? index + 1 : 0} / {count}</em>
      <button type="button" aria-label="Next" disabled={count < 2} onClick={() => go(1)}>›</button>
    </div>
  );
}

const mb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} GB` : `${n} MB`);
const cap = (k: string) => k[0].toUpperCase() + k.slice(1);

/** Hunches: which voice model listens, and which model puts what you said in shape. Both are picked like Finances' categories: chips. */
function VoiceNotes() {
  const models = useAppStore((s) => s.models);
  const mentor = useAppStore((s) => s.selectedModel);
  const [stt, setStt] = useState<SpeechModel[]>([]);
  const [shaper, setShaperState] = useState(getShaper);
  const downloading = stt.some((m) => m.downloading);
  useEffect(() => {
    let live = true;
    const look = () => listSpeechModels().then((m) => { if (live) setStt(m); }).catch(() => { /* no voice engine */ });
    void look();
    const id = window.setInterval(() => { if (downloading) void look(); }, 2000);
    return () => { live = false; window.clearInterval(id); };
  }, [downloading]);
  const current = getSpeechModelName(stt);
  const picked = stt.find((m) => m.model === current);
  const chat = models.filter((m) => !isEmbedOnlyModel(m.id) && !isCliModel(m.id));
  const shaped = shaper || mentor;
  const fail = (er: unknown) => toast.error(er instanceof Error ? er.message : 'Could not change it');
  return (
    <div className="mm-cfg-card">
      <h4>Hunches</h4>
      <div className="mm-cfg-sel" role="group" aria-label="Listen">
        <span>Listen</span>
        <Stepper count={stt.length} index={Math.max(0, stt.findIndex((m) => m.model === current))}
          label={picked ? `Whisper ${cap(picked.model)}` : '…'} note={picked ? mb(picked.size_mb) : ''} have={picked?.installed}
          onStep={(i) => { setSpeechModel(stt[i].model).then(() => listSpeechModels().then(setStt)).catch(fail); }} />
      </div>
      {picked && !picked.installed && (
        <p className="mm-cfg-note">{picked.downloading ? `Downloading… ${Math.round(picked.progress * 100)}%` : 'Not on this computer yet.'}
          {!picked.downloading && <button type="button" className="mm-btn" onClick={() => { downloadSpeechModel().then(() => listSpeechModels().then(setStt)).catch((er) => toast.error(er instanceof Error ? er.message : 'Could not start')); }}>Download</button>}</p>
      )}
      <div className="mm-cfg-sel" role="group" aria-label="Shape">
        <span>Shape</span>
        <Stepper count={chat.length} index={Math.max(0, chat.findIndex((m) => m.id === shaped))} label={short(shaped) || '…'} note=""
          onStep={(i) => { setShaper(chat[i].id); setShaperState(chat[i].id); }} />
      </div>
    </div>
  );
}

/** The size the server listens with right now. */
const getSpeechModelName = (list: SpeechModel[]) => list.find((m) => m.current)?.model ?? '';

const Toggle = ({ on, onChange, label, big, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; big?: boolean; hint?: string }) => (
  <button type="button" className={`mm-toggle${big ? ' mm-toggle-big' : ''}`} data-on={on} aria-pressed={on} onClick={() => onChange(!on)}><span>{label}{hint && <small>{hint}</small>}</span><i /></button>
);

/** Settings: how the floating Phibe answers, and how Memoir behaves. */
export function ConfigPanel() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const think = useAppStore((s) => s.deepResearch);
  const setThink = useAppStore((s) => s.setDeepResearch);

  return (
    <div className="mm-pad mm-swap mm-cfg">
      <div className="mm-head"><h2>Settings</h2></div>
      <div className="mm-cfg-card"><h4>Model</h4><ModelChoices /></div>
      <div className="mm-cfg-row">
        <div className="mm-cfg-card">
          <label><span>Temperature<em>{settings.temperature}</em></span>
            <input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={(e) => update({ temperature: parseFloat(e.target.value) })} /></label>
          <label><span>Max Tokens<em>{settings.maxTokens}</em></span>
            <input type="range" min="256" max="32768" step="256" value={settings.maxTokens} onChange={(e) => update({ maxTokens: parseInt(e.target.value) })} /></label>
          <Toggle big on={think} onChange={setThink} label="Muse" />
        </div>
        <VoiceNotes />
      </div>
    </div>
  );
}
