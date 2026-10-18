import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { shortcutFromEvent } from '../lib/shortcutKeys';
import { AgentsPage } from './AgentsPage';
import { DataSourcesPage } from './DataSourcesPage';
import { ComputerWidget } from '../horizon/widgets/computer';
import { YourData } from '../components/YourData';
import {
  Palette,
  Globe,
  Cpu,
  Database,
  Info,
  Check,
  Download,
  Upload,
  Trash2,
  Mic,
  Key,
  Search,
  Brain,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import {
  checkHealth,
  fetchSpeechHealth,
  getInferenceSource,
  setInferenceSource,
  getCloudKeyStatus,
  saveCloudKey,
  fetchToolCredentialStatus,
  saveToolCredentials,
  deleteToolCredential,
  isTauri,
  apiFetch,
  fetchSyncSettings,
  saveSyncSettings,
  fetchDataFolder,
  openDataFolder,
  fetchAvailableTools,
  type ToolInfo,
  syncAllConnectors,
  type InferenceSource,
  type SyncSettings,
} from '../lib/api';
import { toast } from 'sonner';
import { CLI_ENGINES_ENABLED } from '../lib/features';
import { Icon, type IconName } from '../components/Icon';

const CLOUD_KEY_STATUS_CHANGED = 'phibe-cloud-key-status-changed';

function OllamaModelList() {
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  useEffect(() => {
    fetch('http://localhost:11434/api/tags')
      .then(r => r.json())
      .then(data => setModels((data.models || []).map((m: any) => ({ name: m.name, size: m.size }))))
      .catch(() => setModels([]));
  }, []);
  if (models.length === 0) return <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No models loaded</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {models.map(m => (
        <span key={m.name} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }} />
          {m.name} ({(m.size / 1e9).toFixed(1)} GB)
        </span>
      ))}
    </div>
  );
}

function ApiKeyInput({
  keyName,
  placeholder,
  toolName,
}: {
  keyName: string;
  placeholder: string;
  toolName?: string;
}) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [error, setError] = useState('');
  const desktopKeyStorage = isTauri();
  const serverToolStorage = !desktopKeyStorage && !!toolName;
  const canManage = desktopKeyStorage || serverToolStorage;

  const refresh = useCallback(async () => {
    if (!canManage) {
      setHasKey(false);
      return;
    }
    try {
      const status = desktopKeyStorage
        ? await getCloudKeyStatus()
        : await fetchToolCredentialStatus(toolName!);
      setHasKey(!!status[keyName]);
    } catch {
      setHasKey(false);
    }
  }, [canManage, desktopKeyStorage, keyName, toolName]);

  useEffect(() => {
    void refresh();
    window.addEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
    return () => window.removeEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
  }, [refresh]);

  const save = async (v: string) => {
    const next = v.trim();
    if (!next) return;
    setError('');
    try {
      if (desktopKeyStorage) {
        await saveCloudKey(keyName, next);
      } else if (toolName) {
        await saveToolCredentials(toolName, { [keyName]: next });
      } else {
        return;
      }
      setValue('');
      setHasKey(true);
      setSaved(true);
      window.dispatchEvent(new Event(CLOUD_KEY_STATUS_CHANGED));
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message || 'Failed to save API key');
    }
  };

  const remove = async () => {
    setError('');
    try {
      if (desktopKeyStorage) {
        await saveCloudKey(keyName, '');
      } else if (toolName) {
        await deleteToolCredential(toolName, keyName);
      } else {
        return;
      }
      setValue('');
      setHasKey(false);
      setSaved(true);
      window.dispatchEvent(new Event(CLOUD_KEY_STATUS_CHANGED));
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message || 'Failed to remove API key');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={() => { if (value.trim()) void save(value); }}
        placeholder={hasKey ? (desktopKeyStorage ? 'Saved in secure storage' : 'Saved by local server') : placeholder}
        disabled={!canManage}
        className="w-48 px-2 py-1 rounded text-xs"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
      {hasKey && (
        <button
          onClick={() => void remove()}
          className="px-2 py-1 rounded text-[10px] cursor-pointer"
          style={{ color: 'var(--color-error)', border: '1px solid var(--color-error)' }}
        >
          Remove
        </button>
      )}
      {saved && <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>Saved</span>}
      {error && <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>{error}</span>}
    </div>
  );
}

function CloudProviderStatus({ label, keyName, toolName }: { label: string; keyName: string; toolName: string }) {
  const [hasKey, setHasKey] = useState(false);
  const desktopKeyStorage = isTauri();

  const refresh = useCallback(async () => {
    try {
      const status = desktopKeyStorage
        ? await getCloudKeyStatus()
        : await fetchToolCredentialStatus(toolName);
      setHasKey(!!status[keyName]);
    } catch {
      setHasKey(false);
    }
  }, [desktopKeyStorage, keyName, toolName]);

  useEffect(() => {
    void refresh();
    window.addEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
    return () => window.removeEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
  }, [refresh]);

  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
        background: hasKey ? 'var(--color-success)' : 'var(--color-text-tertiary)',
      }} />
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="set-section fin-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const SYNC_INTERVALS = [5, 15, 30, 60, 180, 360, 720, 1440];

function intervalLabel(minutes: number): string {
  if (minutes === 0) return 'Only when Phibe starts';
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return 'Every hour';
  if (minutes % 60 === 0 && minutes < 1440) return `Every ${minutes / 60} hours`;
  if (minutes === 1440) return 'Once a day';
  return `Every ${minutes} minutes`;
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="set-switch"
    >
      <span />
    </button>
  );
}

/** How and when connected sources (Anytype and the others) are kept up to date. */
function SyncSection({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(() => {
    fetchSyncSettings().then(setSettings).catch(() => setSettings(null));
  }, []);
  useEffect(reload, [reload]);

  const change = async (changes: Partial<SyncSettings>) => {
    try {
      setSettings(await saveSyncSettings(changes));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
      reload();
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await syncAllConnectors();
      setTimeout(() => { reload(); setSyncing(false); }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the sync');
      setSyncing(false);
    }
  };

  if (!settings) {
    return (
      <Section title="Synchronization">
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
      </Section>
    );
  }
  const selectableIntervals = [0, ...SYNC_INTERVALS];
  const intervals = selectableIntervals.includes(settings.interval_minutes)
    ? selectableIntervals
    : [...selectableIntervals, settings.interval_minutes].sort((a, b) => a - b);
  return (
    <Section title="Synchronization">
      <SettingRow label="Automatic Sync" description="Works In The Background">
        <Switch on={settings.auto_enabled} label="Automatic Sync" onClick={() => change({ auto_enabled: !settings.auto_enabled })} />
      </SettingRow>
      <SettingRow label="How Often">
        <select
          value={settings.interval_minutes}
          disabled={!settings.auto_enabled}
          onChange={(e) => change({ interval_minutes: parseInt(e.target.value, 10) })}
          className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        >
          {intervals.map((m) => (
            <option key={m} value={m}>{intervalLabel(m)}</option>
          ))}
        </select>
      </SettingRow>
      {settings.interval_minutes === 1440 && (
        <SettingRow label="At What Time">
          <input
            type="time"
            value={settings.daily_time}
            disabled={!settings.auto_enabled}
            onChange={(e) => { if (e.target.value) void change({ daily_time: e.target.value }); }}
            className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          />
        </SettingRow>
      )}
      <SettingRow label="" description="Sync Every Connected Source">
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg cursor-pointer disabled:opacity-60"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
        >
          <Icon name="refresh" size={14} className={syncing ? 'animate-spin' : undefined} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </SettingRow>
    </Section>
  );
}

// The cloud model keys are added from Phibe's island, so they are not repeated under Tools.
const CLOUD_KEYS = new Set(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'TYPESAFE_API_KEY']);

/**
 * Every tool that needs a key shows up here on its own, straight from the server.
 * To add a tool: register it in the backend (and list its keys in TOOL_CREDENTIALS),
 * or plug in an MCP server. No change to this screen is needed.
 */
function ToolsSection() {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  useEffect(() => {
    fetchAvailableTools().then(setTools).catch(() => setTools([]));
  }, []);

  const withKeys = (tools ?? []).filter(
    (t) => t.source === 'tool' && t.credential_keys.some((k) => !CLOUD_KEYS.has(k)),
  );
  const others = (tools ?? []).length - withKeys.length;

  return (
    <Section title="Tools">
      {tools === null && <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>}
      {withKeys.map((t) => (
        <div key={t.name}>
          {t.credential_keys.filter((k) => !CLOUD_KEYS.has(k)).map((key) => (
            <SettingRow key={key} label={`${t.name.replace(/_/g, ' ')} (${key.replace(/_API_KEY$/, '').toLowerCase()})`} description={`${t.description || t.category} — ${key}`}>
              <ApiKeyInput keyName={key} placeholder={key} toolName={t.name} />
            </SettingRow>
          ))}
        </div>
      ))}
      {tools !== null && (
        <div className="text-xs pt-3" style={{ color: 'var(--color-text-tertiary)' }}>
          {others} more tools work without a key. New tools, including any MCP server, appear here automatically when they need one.
        </div>
      )}
    </Section>
  );
}

/** Where Phibe keeps its files on this computer, with a button to open that folder. */
function DataFolderRow() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    fetchDataFolder().then((f) => setPath(f.path)).catch(() => setPath(null));
  }, []);

  const open = async () => {
    try {
      await openDataFolder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the folder');
    }
  };

  return (
    <SettingRow label="Phibe folder" description="Tasks, finances, memory, knowledge and settings are saved here">
      <div className="flex items-center gap-2 max-w-md">
        <code className="text-xs truncate px-2 py-1 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }} title={path ?? ''}>
          {path ?? 'Unavailable'}
        </code>
        <button
          type="button"
          onClick={() => void open()}
          disabled={!path}
          className="composer-icon shrink-0 disabled:opacity-40"
          title="Open in file explorer"
          aria-label="Open in file explorer"
        >
          <Icon name="folder" size={18} />
        </button>
      </div>
    </SettingRow>
  );
}

/** Effects (background stars, the face animation) — picked here, applied on Save. */
function AppearanceSection({
  settings,
  updateSettings,
  onSaved,
}: {
  settings: { effects: 'full' | 'balanced' | 'off' };
  updateSettings: (partial: { effects: 'full' | 'balanced' | 'off' }) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(settings.effects);
  useEffect(() => setDraft(settings.effects), [settings.effects]);
  const dirty = draft !== settings.effects;

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
    </Section>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        {label && <b>{label}</b>}
        {description && <span>{description}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}


const SETTINGS_TABS = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'agents', label: 'Agents', icon: 'bot' },
  { id: 'ai', label: 'API', icon: 'key-minimalistic' },
  { id: 'data-sources', label: 'Data Source', icon: 'database' },
  { id: 'integrations', label: 'Integrations', icon: 'link-round' },
  { id: 'about', label: 'About', icon: 'info-circle' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

interface VoiceModelStatus {
  model: string;
  installed: boolean;
  downloading: boolean;
  size_mb: number;
  progress: number;
  error: string | null;
}

/** Whether the voice model is on this computer, with a button to download it (never automatic). */
function VoiceModelRow() {
  const [status, setStatus] = useState<VoiceModelStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/speech/model');
      if (res.ok) setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Follow the download while it runs.
  const busy = status?.downloading;
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [busy, refresh]);

  const start = async () => {
    const res = await apiFetch('/v1/speech/model/download', { method: 'POST' });
    if (res.ok) setStatus(await res.json());
  };

  if (!status) return null;
  const note = status.installed
    ? `${status.model} is on this computer`
    : status.downloading
      ? `Downloading ${status.model}: ${Math.round(status.progress * 100)}%`
      : status.error ?? `${status.model}, ${status.size_mb} MB. Needed to understand your voice.`;
  return (
    <SettingRow label="Voice model" description={note}>
      {status.installed ? (
        <span className="text-xs" style={{ color: 'var(--color-success)' }}>Ready</span>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={status.downloading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60 disabled:cursor-default"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
        >
          {status.downloading ? 'Downloading…' : `Download (${status.size_mb} MB)`}
        </button>
      )}
    </SettingRow>
  );
}

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
  const note = status.installed
    ? 'Uses your NVIDIA graphics card to understand your voice faster.'
    : status.downloading
      ? `Downloading the GPU pack: ${Math.round(status.progress * 100)}%`
      : status.error ?? `Optional download, about ${status.size_mb / 1000} GB. Understands your voice in under a second.`;
  return (
    <SettingRow label="Faster voice with an NVIDIA GPU" description={note}>
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
const FIELD_STYLE: React.CSSProperties = { background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };

/** The global voice shortcut, microphone, silence timing and custom words (desktop app only). */
function VoiceShortcutSection({ onSaved }: { onSaved: () => void }) {
  const [data, setData] = useState<VoiceSettingsData | null>(null);
  const [mics, setMics] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [words, setWords] = useState('');

  useEffect(() => {
    void (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const current = await invoke<VoiceSettingsData>('voice_settings_get');
      setData(current);
      setWords(current.custom_words.join('\n'));
      setMics(await invoke<string[]>('voice_list_mics'));
    })().catch(() => setData(null));
  }, []);

  const save = useCallback(async (next: VoiceSettingsData) => {
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
  const mic = data.mic && mics.includes(data.mic) ? data.mic : '';

  return (
    <Section title="Global Voice">
      <SettingRow label="Voice shortcut" description="Works from any app: press to talk, press again to send. Esc cancels.">
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
      <SettingRow label="Microphone" description="The one Phibe listens to with the shortcut.">
        <select value={mic} onChange={(e) => void save({ ...data, mic: e.target.value || null })} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer max-w-[16rem]" style={FIELD_STYLE}>
          <option value="">Windows default</option>
          {mics.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </SettingRow>
      <SettingRow label="Silence before the countdown" description="How long Phibe waits when you stop talking.">
        <select value={data.silence_secs} onChange={(e) => void save({ ...data, silence_secs: Number(e.target.value) })} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={FIELD_STYLE}>
          {[3, 5, 7, 10, 15, 20].map((s) => <option key={s} value={s}>{s} seconds</option>)}
        </select>
      </SettingRow>
      <SettingRow label="Countdown" description="Then the card closes; what you said is kept as a draft.">
        <select value={data.countdown_secs} onChange={(e) => void save({ ...data, countdown_secs: Number(e.target.value) })} className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={FIELD_STYLE}>
          {[3, 5, 8, 10].map((s) => <option key={s} value={s}>{s} seconds</option>)}
        </select>
      </SettingRow>
      <div className="pt-3">
        <div className="text-sm" style={{ color: 'var(--color-text)' }}>Custom words</div>
        <div className="text-xs mt-0.5 mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Names and brands Phibe should spell right, one per line.</div>
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          onBlur={() => void save({ ...data, custom_words: words.split('\n') })}
          rows={4}
          placeholder={'eKyte\nRed Shield'}
          className="w-full text-sm px-3 py-2 rounded-lg outline-none"
          style={FIELD_STYLE}
        />
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const [dataView, setDataView] = useState<'Sources' | 'Your Data'>('Sources');
  const wanted = params.get('tab');
  const tab: SettingsTab = SETTINGS_TABS.some((t) => t.id === wanted) ? (wanted as SettingsTab) : 'general';
  const setTab = (id: SettingsTab) => setParams(id === 'general' ? {} : { tab: id }, { replace: true });
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const conversations = useAppStore((s) => s.conversations);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [speechBackendAvailable, setSpeechBackendAvailable] = useState<boolean | null>(null);
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

  useEffect(() => {
    checkHealth().then(setHealthy);
    fetchSpeechHealth()
      .then((h) => setSpeechBackendAvailable(h.available))
      .catch(() => setSpeechBackendAvailable(false));
  }, []);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = () => {
    const data = localStorage.getItem('phibe-conversations') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phibe-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.version === 1) {
            localStorage.setItem('phibe-conversations', JSON.stringify(data));
            useAppStore.getState().loadConversations();
            showSaved();
          }
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    localStorage.removeItem('phibe-conversations');
    useAppStore.getState().loadConversations();
    setConfirmClear(false);
    showSaved();
  };

  return (
    <div className="fin-root set-root flex flex-col h-full overflow-hidden">
      <div className="set-head shrink-0">
        <header className="set-title">
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

      {tab === 'agents' && <AgentsPage />}
      {tab === 'data-sources' && (
        <>
          <div className="set-sub shrink-0" role="tablist">
            {(['Sources', 'Your Data'] as const).map((label) => (
              <button key={label} type="button" role="tab" aria-selected={dataView === label} data-active={dataView === label} onClick={() => setDataView(label)}>
                {label}
              </button>
            ))}
          </div>
          {dataView === 'Sources' ? <DataSourcesPage /> : <YourData />}
        </>
      )}
      {tab !== 'agents' && tab !== 'data-sources' && (
      <div className="flex-1 min-h-0 overflow-y-auto px-6">
      <div className="set-cols">
      <div className="set-main">
        <div className="flex flex-col gap-4">
          {tab === 'general' && (
            <>
              <AppearanceSection settings={settings} updateSettings={updateSettings} onSaved={showSaved} />
              <Section title="Floating Phibe">
                <SettingRow label="Show Phibe on screen" description="A small button you can drag anywhere. Click it to see what is waiting for you.">
                  <Switch on={settings.floatingPhibe} label="Show Phibe on screen"
                    onClick={() => { updateSettings({ floatingPhibe: !settings.floatingPhibe }); showSaved(); }} />
                </SettingRow>
              </Section>
            </>
          )}

          {tab === 'ai' && (
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

          {/* Model parameters */}
          <Section title="Model Parameters">
            <SettingRow label="Temperature" description={`${settings.temperature}`}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => { updateSettings({ temperature: parseFloat(e.target.value) }); showSaved(); }}
                className="w-32 cursor-pointer accent-[var(--color-accent)]"
              />
            </SettingRow>
            <SettingRow label="Max tokens" description={`${settings.maxTokens}`}>
              <input
                type="range"
                min="256"
                max="32768"
                step="256"
                value={settings.maxTokens}
                onChange={(e) => { updateSettings({ maxTokens: parseInt(e.target.value) }); showSaved(); }}
                className="w-32 cursor-pointer accent-[var(--color-accent)]"
              />
            </SettingRow>
          </Section>
          </>
          )}

          {tab === 'integrations' && (
            <ToolsSection />
          )}

          {/* Speech */}
          {tab === 'general' && (
          <Section title="Speech">
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
            <VoiceModelRow />
            <GpuPackRow onSaved={showSaved} />
          </Section>
          )}

          {tab === 'general' && isTauri() && <VoiceShortcutSection onSaved={showSaved} />}

          {tab === 'general' && (
          <>
          {/* Data */}
          <Section title="Data">
            <DataFolderRow />
            <SettingRow label="Conversations" description={`${conversations.length} stored locally`}>
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                >
                  <Download size={12} /> Export
                </button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                >
                  <Upload size={12} /> Import
                </button>
              </div>
            </SettingRow>
            <SettingRow label="Clear all data" description="Permanently delete all conversations">
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                style={{
                  color: confirmClear ? 'white' : 'var(--color-error)',
                  background: confirmClear ? 'var(--color-error)' : 'transparent',
                  border: '1px solid var(--color-error)',
                }}
                onMouseEnter={(e) => { if (!confirmClear) e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; }}
                onMouseLeave={(e) => { if (!confirmClear) e.currentTarget.style.background = 'transparent'; }}
              >
                <Trash2 size={12} /> {confirmClear ? 'Click again to confirm' : 'Clear'}
              </button>
            </SettingRow>
          </Section>
          </>
          )}

          {/* Connection */}
          {tab === 'general' && (
          <Section title="Connection">
            <SettingRow label="Server status" description={serverInfo ? `${serverInfo.engine} / ${serverInfo.model}` : 'Not connected'}>
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: healthy === true ? 'var(--color-success)' : healthy === false ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {healthy === true ? 'Connected' : healthy === false ? 'Disconnected' : 'Checking...'}
                </span>
              </div>
            </SettingRow>
            <SettingRow label="API URL" description="Set if backend runs on a different port or host">
              <input
                type="text"
                value={settings.apiUrl}
                onChange={(e) => { updateSettings({ apiUrl: e.target.value }); showSaved(); }}
                placeholder="http://localhost:8000"
                className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                style={{
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </SettingRow>
            <SettingRow label="API key" description="Required only if the server was started with an API key">
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => { updateSettings({ apiKey: e.target.value }); showSaved(); }}
                placeholder="PHIBE_API_KEY"
                autoComplete="off"
                className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                style={{
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </SettingRow>
          </Section>
          )}

          {/* Synchronization */}
          {tab === 'general' && <SyncSection onSaved={showSaved} />}

          {/* Status */}
          {tab === 'general' && (
          <Section title="Status">
            <SettingRow label="Local Models">
              <OllamaModelList />
            </SettingRow>
            <SettingRow label="Cloud Models">
              <div className="flex flex-wrap gap-3">
                <CloudProviderStatus label="OpenAI" keyName="OPENAI_API_KEY" toolName="openai" />
                <CloudProviderStatus label="Anthropic" keyName="ANTHROPIC_API_KEY" toolName="anthropic" />
                <CloudProviderStatus label="Google" keyName="GEMINI_API_KEY" toolName="gemini" />
                <CloudProviderStatus label="OpenRouter" keyName="OPENROUTER_API_KEY" toolName="openrouter" />
                <CloudProviderStatus label="TypeSafe" keyName="TYPESAFE_API_KEY" toolName="jev" />
              </div>
            </SettingRow>
            <SettingRow label="Transcription Engine">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: speechBackendAvailable === true ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {speechBackendAvailable === null ? 'Checking...'
                    : speechBackendAvailable ? 'Available'
                    : 'Not configured'}
                </span>
              </div>
            </SettingRow>
            {!speechBackendAvailable && speechBackendAvailable !== null && (
              <div className="text-xs mt-2 px-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Set up a speech backend to use voice input.
                See the <a href="https://github.com/nizaelneves/phibe" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>documentation</a> for details.
              </div>
            )}
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
      <aside className="set-aside" aria-label="This computer"><ComputerWidget /></aside>
      </div>
      </div>
      )}
    </div>
  );
}
