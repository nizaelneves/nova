import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { useAppStore } from '../../lib/store';
import { CLI_ENGINES_ENABLED } from '../../lib/features';
import { EFFORT_LABELS, EFFORT_LEVELS, isCliModel, isEmbedOnlyModel } from '../../lib/model-capabilities';
import { CLAUDE_MODELS, CODEX_MODELS } from '../Chat/EngineMenu';
import { SPEECH_SIZES, downloadSpeechModel, getShaper, listSpeechModels, setShaper, setSpeechModel, type SpeechModel } from '../../lib/voice-notes';
import { getAutoPlay, setAutoPlay } from '../../lib/swipe-api';
import { fetchClaudeCliStatus, fetchCodexCliStatus, startClaudeCliLogin, startCodexCliLogin } from '../../lib/api';
import { toast } from 'sonner';
import { MemoirChats, MemoirVoice } from './ConfigMore';

const short = (id: string) => id.replace(/^ollama:/, '');

type CliState = { installed: boolean; signed_in: boolean } | null;

/** Whether Claude Code and Codex are installed and signed in. After a sign-in window is opened it looks once more, when the user comes back to Phibe. */
function useCli() {
  const [claude, setClaude] = useState<CliState>(null);
  const [codex, setCodex] = useState<CliState>(null);
  const armed = useRef(false);
  const look = useCallback(() => {
    fetchClaudeCliStatus().then(setClaude).catch(() => { /* keeps "Checking" */ });
    fetchCodexCliStatus().then(setCodex).catch(() => { /* keeps "Checking" */ });
  }, []);
  useEffect(() => {
    if (!CLI_ENGINES_ENABLED) return undefined;
    look();
    const back = () => { if (armed.current) { armed.current = false; look(); } };
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, [look]);
  const signIn = (which: 'claude' | 'codex') => {
    (which === 'claude' ? startClaudeCliLogin : startCodexCliLogin)()
      .then(({ opened }) => { if (opened) { armed.current = true; toast.info('Finish Signing in Terminal'); } else toast.error(`Could not open a terminal. Run \`${which === 'claude' ? 'claude' : 'codex login'}\` in your own terminal.`, { duration: 8000 }); })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not start the sign-in'));
  };
  return { claude, codex, signIn };
}
type Cli = ReturnType<typeof useCli>;

/** One command-line engine: its models when it is online, otherwise what to do (install it, or sign in on this screen). */
function CliGroup({ name, login, status, onSignIn, children }: { name: string; login: string; status: CliState; onSignIn: () => void; children: React.ReactNode }) {
  return (
    <div><h6>{name}</h6>
      {status === null ? <p>Checking…</p>
        : !status.installed ? <p>Install {name} To Use It</p>
          : !status.signed_in ? (
            <button type="button" className="mm-mrow" onClick={onSignIn}>
              <span><b>{login}</b><small>Never Sees Password or Token</small></span><Icon name="key-minimalistic" size={16} />
            </button>
          ) : children}
    </div>
  );
}

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
function ModelChoices({ cli }: { cli: Cli }) {
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
        <CliGroup name="Claude Code" login="Sign In With Claude" status={cli.claude} onSignIn={() => cli.signIn('claude')}>{CLAUDE_MODELS.map((m) => row(m.id, m.label, m.note))}<Effort /></CliGroup>
        <CliGroup name="Codex" login="Sign In With Codex" status={cli.codex} onSignIn={() => cli.signIn('codex')}>{CODEX_MODELS.map((m) => row(m.id, m.label, m.note))}<Effort /></CliGroup>
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
function VoiceNotes({ cli }: { cli: Cli }) {
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
  const choices = [
    ...chat.map((m) => ({ id: m.id, label: short(m.id), online: true })),
    ...(CLI_ENGINES_ENABLED && cli.claude?.installed ? CLAUDE_MODELS.map((m) => ({ id: m.id, label: `Claude Code · ${m.label}`, online: !!cli.claude?.signed_in })) : []),
    ...(CLI_ENGINES_ENABLED && cli.codex?.installed ? CODEX_MODELS.map((m) => ({ id: m.id, label: `Codex · ${m.label}`, online: !!cli.codex?.signed_in })) : []),
  ];
  const shaped = shaper || mentor;
  const now = choices.find((c) => c.id === shaped);
  const noCli = CLI_ENGINES_ENABLED && cli.claude !== null && cli.codex !== null && !cli.claude.installed && !cli.codex.installed;
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
      <small className="mm-hint">Turns your voice into text.</small>
      {picked && !picked.installed && (
        <p className="mm-cfg-note">{picked.downloading ? `Downloading… ${Math.round(picked.progress * 100)}%` : 'Not on this computer yet.'}
          {!picked.downloading && <button type="button" className="mm-btn" onClick={() => { downloadSpeechModel().then(() => listSpeechModels().then(setStt)).catch((er) => toast.error(er instanceof Error ? er.message : 'Could not start')); }}>Download</button>}</p>
      )}
      <div className="mm-cfg-sel" role="group" aria-label="Shape">
        <span>Shape</span>
        <Stepper count={choices.length} index={Math.max(0, choices.findIndex((c) => c.id === shaped))} label={now?.label ?? (short(shaped) || '…')} note={now ? (now.online ? 'Online' : 'Offline') : ''} have={now?.online}
          onStep={(i) => { setShaper(choices[i].id); setShaperState(choices[i].id); }} />
      </div>
      <small className="mm-hint">Turns what you said into a clean Hunch.</small>
      {noCli && <small className="mm-hint">Install Claude Code Or Codex To Use Them Here</small>}
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
  const [auto, setAuto] = useState(getAutoPlay);
  const cli = useCli();
  const [tab, setTab] = useState<'general' | 'data'>('general');

  return (
    <div className="mm-pad mm-swap mm-cfg">
      <div className="mm-head"><h2>Settings</h2></div>
      <div className="mm-tabs" role="tablist" aria-label="Settings sections">
        {([['general', 'General', 'settings'], ['data', 'Your Data', 'database']] as const).map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-label={label} title={label} className="mm-tab" data-on={tab === id} onClick={() => setTab(id)}>
            <Icon name={icon} size={16} /><span>{label}</span>
          </button>
        ))}
      </div>
      {tab === 'data' && <MemoirChats />}
      {tab === 'general' && <>
      <div className="mm-cfg-card"><h4>Model</h4><ModelChoices cli={cli} /></div>
      <div className="mm-cfg-row">
        <div className="mm-cfg-card">
          <label><span>Temperature<em>{settings.temperature}</em></span>
            <input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={(e) => update({ temperature: parseFloat(e.target.value) })} /><small className="mm-hint">Higher is more creative, lower is more accurate.</small></label>
          <label><span>Max Tokens<em>{settings.maxTokens}</em></span>
            <input type="range" min="256" max="32768" step="256" value={settings.maxTokens} onChange={(e) => update({ maxTokens: parseInt(e.target.value) })} /><small className="mm-hint">The maximum size of each reply.</small></label>
        </div>
        <VoiceNotes cli={cli} />
      </div>
      <MemoirVoice />
      <div className="mm-cfg-card"><h4>Videos</h4>
        <Toggle big on={auto} onChange={(v) => { setAuto(v); setAutoPlay(v); }} label="Auto Play" hint="Start a video as soon as you open it, works globally" />
      </div>
      </>}
    </div>
  );
}
