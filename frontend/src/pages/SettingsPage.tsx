import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { shortcutFromEvent } from '../lib/shortcutKeys';
import { Section, SettingRow, Switch } from '../components/settingsParts';
import { YourData } from '../components/YourData';
import { PhibeSystem } from '../components/PhibeSystem';
import { TerminalLine } from '../components/TerminalLine';
import { summarizeSettings } from '../lib/settingsSummary';
import { Check, Download } from 'lucide-react';
import { useAppStore } from '../lib/store';
import {
  getInferenceSource,
  setInferenceSource,
  isTauri,
  apiFetch,
  type InferenceSource,
} from '../lib/api';
import { toast } from 'sonner';
import { Icon, type IconName } from '../components/Icon';
import { entryAnimation, setEntryAnimation } from '../lib/memoirTransition';

/** Effects (background stars, the face animation) — picked here, applied on Save. */
function AppearanceSection({
  settings,
  updateSettings,
  onSaved,
}: {
  settings: { effects: 'full' | 'balanced' | 'off'; floatingPhibe: boolean };
  updateSettings: (partial: Partial<{ effects: 'full' | 'balanced' | 'off'; floatingPhibe: boolean }>) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(settings.effects);
  useEffect(() => setDraft(settings.effects), [settings.effects]);
  const dirty = draft !== settings.effects;
  const [memoirFx, setMemoirFx] = useState(entryAnimation);

  return (
    <Section title="Appearance">
      <SettingRow label="Effects">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
            {([['full', 'Full'], ['balanced', 'Balanced'], ['off', 'Off']] as const).map(([value, label]) => {
              const isActive = draft === value;
              return (
                <button
                  key={value}
                  onClick={() => setDraft(value)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    background: isActive ? 'var(--color-accent)' : 'transparent',
                    color: isActive ? 'var(--color-on-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => { updateSettings({ effects: draft }); onSaved(); }}
            disabled={!dirty}
            className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            Save
          </button>
        </div>
      </SettingRow>
      <SettingRow label="Show Phibe On Screen">
        <Switch on={settings.floatingPhibe} label="Show Phibe On Screen"
          onClick={() => { updateSettings({ floatingPhibe: !settings.floatingPhibe }); onSaved(); }} />
      </SettingRow>
      <SettingRow label="Memoir Entry Animation">
        <Switch on={memoirFx} label="Memoir Entry Animation" onClick={() => { setEntryAnimation(!memoirFx); setMemoirFx(!memoirFx); onSaved(); }} />
      </SettingRow>
    </Section>
  );
}

const SETTINGS_TABS = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'phibe-system', label: 'System', icon: 'stars' },
  { id: 'your-data', label: 'Your Data', icon: 'database' },
  { id: 'about', label: 'About', icon: 'info-circle' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

interface GpuPackStatus {
  available: boolean;
  installed: boolean;
  enabled: boolean;
  downloading: boolean;
  progress: number;
  size_mb: number;
  error: string | null;
}

/** The optional NVIDIA GPU pack: only shown on a computer that has such a GPU. */
function GpuPackRow({ onSaved }: { onSaved: () => void }) {
  const [status, setStatus] = useState<GpuPackStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/speech/gpu');
      if (res.ok) setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const busy = status?.downloading;
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [busy, refresh]);

  const post = async (path: string, body?: unknown) => {
    const res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) {
      setStatus(await res.json());
      onSaved();
    }
  };

  if (!status?.available) return null;
  const note = status.downloading ? `Downloading the GPU pack: ${Math.round(status.progress * 100)}%` : status.installed ? undefined : status.error ?? undefined;
  return (
    <SettingRow label="Faster Voice Using NVIDIA GPU" description={note}>
      {status.installed ? (
        <Switch on={status.enabled} label="Use the GPU for voice" onClick={() => void post('/v1/speech/gpu/enable', { enabled: !status.enabled })} />
      ) : (
        <button
          type="button"
          onClick={() => void post('/v1/speech/gpu/install')}
          disabled={status.downloading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60 disabled:cursor-default"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
        >
          {status.downloading ? 'Downloading…' : `Download (${status.size_mb / 1000} GB)`}
        </button>
      )}
    </SettingRow>
  );
}

interface VoiceSettingsData {
  shortcut: string;
  silence_secs: number;
  countdown_secs: number;
  custom_words: string[];
  mic: string | null;
}

const DEFAULT_VOICE_SHORTCUT = 'Ctrl+Alt+P';
const VOICE_KEY = 'phibe-voice-settings';
const VOICE_DEFAULTS: VoiceSettingsData = { shortcut: DEFAULT_VOICE_SHORTCUT, silence_secs: 7, countdown_secs: 5, custom_words: [], mic: null };
const FIELD_STYLE: React.CSSProperties = { background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };

/** The global voice shortcut and the timing of its card as rows of the Voice card. In the browser the choices are only remembered here; the global shortcut itself exists in the desktop app. */
function VoiceShortcutRows({ onSaved }: { onSaved: () => void }) {
  const [data, setData] = useState<VoiceSettingsData | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      try { setData({ ...VOICE_DEFAULTS, ...JSON.parse(localStorage.getItem(VOICE_KEY) ?? '{}') }); } catch { setData(VOICE_DEFAULTS); }
      return;
    }
    void (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const current = await invoke<VoiceSettingsData>('voice_settings_get');
      setData(current);
    })().catch(() => setData(null));
  }, []);

  const save = useCallback(async (next: VoiceSettingsData) => {
    if (!isTauri()) {
      try { localStorage.setItem(VOICE_KEY, JSON.stringify(next)); } catch { /* kept until the page closes */ }
      setData(next);
      onSaved();
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const kept = await invoke<VoiceSettingsData>('voice_settings_set', { next });
      setData(kept);
      onSaved();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Could not save the voice settings');
    }
  }, [onSaved]);

  // While recording a new shortcut, the next valid key combination is taken.
  useEffect(() => {
    if (!recording || !data) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      const combo = shortcutFromEvent(e);
      if (!combo) return;
      setRecording(false);
      void save({ ...data, shortcut: combo });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, data, save]);

  if (!data) return null;

  return (
    <>
      <SettingRow label="Voice Shortcut">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRecording((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer min-w-[8rem]"
            style={recording ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' } : FIELD_STYLE}
          >
            {recording ? 'Press the keys…' : data.shortcut}
          </button>
          {data.shortcut !== DEFAULT_VOICE_SHORTCUT && (
            <button type="button" onClick={() => void save({ ...data, shortcut: DEFAULT_VOICE_SHORTCUT })} className="text-xs cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
              Reset
            </button>
          )}
        </div>
      </SettingRow>
      <SettingRow label="Silence Countdown">
        <select value={data.silence_secs} onChange={(e) => void save({ ...data, silence_secs: Number(e.target.value) })} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={FIELD_STYLE}>
          {[3, 5, 7, 10, 15, 20].map((s) => <option key={s} value={s}>{s} seconds</option>)}
        </select>
      </SettingRow>
      <SettingRow label="Stop Countdown">
        <select value={data.countdown_secs} onChange={(e) => void save({ ...data, countdown_secs: Number(e.target.value) })} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={FIELD_STYLE}>
          {[3, 5, 8, 10].map((s) => <option key={s} value={s}>{s} seconds</option>)}
        </select>
      </SettingRow>
    </>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('tab');
  const tab: SettingsTab = SETTINGS_TABS.some((t) => t.id === wanted) ? (wanted as SettingsTab) : 'general';
  const setTab = (id: SettingsTab) => setParams(id === 'general' ? {} : { tab: id }, { replace: true });
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const conversations = useAppStore((s) => s.conversations);
  const [saved, setSaved] = useState(false);


  const [srcKind, setSrcKind] = useState<InferenceSource['kind']>('ollama');
  const [customHost, setCustomHost] = useState('http://localhost:1234/v1');
  const [customModel, setCustomModel] = useState('');
  const [customEngine, setCustomEngine] = useState('lmstudio');
  const [customKey, setCustomKey] = useState('');
  const [srcMsg, setSrcMsg] = useState('');

  useEffect(() => {
    getInferenceSource().then((s) => {
      setSrcKind(s.kind);
      if (s.host) setCustomHost(s.host);
      if (s.model) setCustomModel(s.model);
      if (s.engine) setCustomEngine(s.engine);
    }).catch(() => {});
  }, []);

  const saveSource = useCallback(async () => {
    try {
      if (srcKind === 'custom') {
        await setInferenceSource({ kind: 'custom', host: customHost, model: customModel, engine: customEngine, apiKey: customKey || undefined });
      } else {
        await setInferenceSource({ kind: 'ollama' });
      }
      setSrcMsg('Saved — restart the app to apply.');
    } catch (e: any) {
      setSrcMsg(e?.message ?? 'Failed to save.');
    }
  }, [srcKind, customHost, customModel, customEngine, customKey]);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="fin-root set-root flex flex-col h-full overflow-hidden">
      <div className="set-head shrink-0">
        <header className="fin-header">
          <TerminalLine text={summarizeSettings({ tab, engine: srcKind === 'custom' ? 'custom' : 'ollama', conversations: conversations.length })} />
          <div className="set-right">
            <div className="set-saved" aria-live="polite">
              {saved && <span><Check size={12} /> Saved</span>}
            </div>
            <div className="fin-actions set-acts" role="tablist" aria-label="Settings sections">
              {SETTINGS_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id}
                  className="fin-act" aria-label={t.label} title={t.label} onClick={() => setTab(t.id)}>
                  <Icon name={t.icon} size={16} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>
      </div>

      {tab === 'your-data' && <YourData />}
      {tab === 'phibe-system' && <PhibeSystem />}
      {tab !== 'your-data' && tab !== 'phibe-system' && (
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="fin-wrap">
        <div className="set-grid">
          {tab === 'general' && (
            <>
              <AppearanceSection settings={settings} updateSettings={updateSettings} onSaved={showSaved} />
            </>
          )}

          {tab === 'general' && (
          <>
          {/* Local Engine */}
          <Section title="Local Engine">
            <SettingRow label="Engine">
              <div className="flex items-center gap-2">
                <select
                  value={srcKind}
                  onChange={(e) => { setSrcKind(e.target.value as InferenceSource['kind']); setSrcMsg(''); }}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  <option value="ollama">Ollama (Default)</option>
                  <option value="custom">Custom</option>
                </select>
                <button onClick={saveSource}
                  className="text-sm px-3 py-1.5 rounded-lg cursor-pointer"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
                  Save
                </button>
              </div>
            </SettingRow>
            {srcKind === 'custom' && (
              <>
                <SettingRow label="Server URL" description="e.g. LM Studio: http://localhost:1234/v1">
                  <input type="text" value={customHost} onChange={(e) => { setCustomHost(e.target.value); setSrcMsg(''); }} placeholder="http://localhost:1234/v1"
                    className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} />
                </SettingRow>
                <SettingRow label="Model" description="Model id served by your endpoint">
                  <input type="text" value={customModel} onChange={(e) => { setCustomModel(e.target.value); setSrcMsg(''); }} placeholder="qwen2.5-7b-instruct"
                    className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} />
                </SettingRow>
                <SettingRow label="Server type" description="OpenAI-compatible engine">
                  <select value={customEngine} onChange={(e) => { setCustomEngine(e.target.value); setSrcMsg(''); }}
                    className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                    <option value="lmstudio">LM Studio</option>
                    <option value="vllm">vLLM</option>
                    <option value="sglang">SGLang</option>
                    <option value="llamacpp">llama.cpp</option>
                    <option value="mlx">MLX</option>
                    <option value="lemonade">Lemonade</option>
                  </select>
                </SettingRow>
                <SettingRow label="API key (optional)" description="Only if your server requires one">
                  <input type="password" value={customKey} onChange={(e) => { setCustomKey(e.target.value); setSrcMsg(''); }} placeholder="leave blank if none"
                    className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} />
                </SettingRow>
              </>
            )}
            {srcMsg && (
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-tertiary)' }}>{srcMsg}</p>
            )}
          </Section>

          </>
          )}

          {/* Speech */}
          {tab === 'general' && (
          <Section title="Voice">
            <SettingRow label="Speech-To-Text" description="Dictation">
              <button
                onClick={() => { updateSettings({ speechEnabled: !settings.speechEnabled }); showSaved(); }}
                className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                style={{
                  background: settings.speechEnabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform bg-white"
                  style={{
                    transform: settings.speechEnabled ? 'translateX(20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </button>
            </SettingRow>
            <SettingRow label="Voice Mode">
              <select
                value={settings.voiceReplies}
                onChange={(e) => { updateSettings({ voiceReplies: e.target.value as 'voice' | 'always' | 'off' }); showSaved(); }}
                className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              >
                <option value="voice">When I Speak To Her</option>
                <option value="always">Always</option>
                <option value="off">Never</option>
              </select>
            </SettingRow>
            <VoiceShortcutRows onSaved={showSaved} />
            <GpuPackRow onSaved={showSaved} />
          </Section>
          )}


          {/* About */}
          {tab === 'about' && (
          <Section title="About">
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="mb-4">
                <img src="/brand/phibe-logo-dark.svg" alt="Phibe" height={64} className="brand-logo-dark" style={{ height: 64, width: 'auto' }} />
                <img src="/brand/phibe-logo-light.svg" alt="Phibe" height={64} className="brand-logo-light" style={{ height: 64, width: 'auto' }} />
              </div>
              <div className="flex gap-3 text-xs">
                <a
                  href="https://github.com/nizaelneves/phibe"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Documentation
                </a>
              </div>
            </div>
          </Section>
          )}
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
