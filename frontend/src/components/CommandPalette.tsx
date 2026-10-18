import { useState, useRef, useEffect, useCallback } from 'react';
import { DownloadBar } from './DownloadBar';
import { usePulls } from '../lib/pulls';
import { Search, Cpu, X, Download, Loader2, Trash2, Check, Cloud, Key, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { isCliModel } from '../lib/model-capabilities';
import { useAppStore } from '../lib/store';
import {
  deleteModel,
  fetchModels,
  preloadModel,
  isTauri,
  getCloudKeyStatus,
  saveCloudKey,
} from '../lib/api';

/** Models offered in the Download tab. The default, qwen3.5:4b, is installed with Phibe. */
const CATALOGUE_MODELS = [
  { id: 'qwen3.5:9b', desc: 'Better Answers, Needs 16 GB Of Memory or More' },
];

/** Cloud provider definitions */
interface CloudProvider {
  name: string;
  envKey: string;
  models: Array<{ id: string; desc: string }>;
}

const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', desc: 'GPT-4o — fast, multimodal' },
      { id: 'gpt-4o-mini', desc: 'GPT-4o Mini — cheap, fast' },
      { id: 'o3-mini', desc: 'o3-mini — reasoning' },
    ],
  },
  {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4-6', desc: 'Claude Sonnet 4.6 — balanced' },
      { id: 'claude-opus-4-6', desc: 'Claude Opus 4.6 — most capable' },
      { id: 'claude-haiku-4-5', desc: 'Claude Haiku 4.5 — fastest' },
    ],
  },
  {
    name: 'Google',
    envKey: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-2.5-pro', desc: 'Gemini 2.5 Pro — flagship' },
      { id: 'gemini-2.5-flash', desc: 'Gemini 2.5 Flash — fast' },
      { id: 'gemini-3-pro', desc: 'Gemini 3 Pro — latest' },
    ],
  },
  {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    models: [
      { id: 'openrouter/auto', desc: 'Auto — best model for the task' },
      { id: 'openrouter/anthropic/claude-sonnet-4', desc: 'Claude Sonnet 4 via OpenRouter' },
      { id: 'openrouter/deepseek/deepseek-r1', desc: 'DeepSeek R1 via OpenRouter' },
    ],
  },
];

type Tab = 'installed' | 'catalogue' | 'cloud';

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tab, setTab] = useState<Tab>('installed');
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSuccess, setPullSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [cloudKeyStatus, setCloudKeyStatus] = useState<Record<string, boolean>>({});
  const [cloudKeyError, setCloudKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Claude Code models (sonnet/opus/haiku) live in the CLI menu, not in this list.
  const allModels = useAppStore((s) => s.models);
  const models = allModels.filter((m) => !isCliModel(m.id));
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setModels = useAppStore((s) => s.setModels);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  const pulling = usePulls((s) => s.model);
  const pullProgress = usePulls((s) => s.progress);
  const pullSpeed = usePulls((s) => s.speed);
  const startPull = usePulls((s) => s.start);
  const cancelPull = usePulls((s) => s.cancel);
  const installedIds = new Set(models.map((m) => m.id));
  const desktopKeyStorage = isTauri();

  const refreshCloudKeyStatus = useCallback(async () => {
    if (!desktopKeyStorage) {
      setCloudKeyStatus({});
      return;
    }
    try {
      setCloudKeyStatus(await getCloudKeyStatus());
      setCloudKeyError(null);
    } catch (e: any) {
      setCloudKeyError(e?.message || 'Failed to read cloud key status');
    }
  }, [desktopKeyStorage]);

  const filtered = tab === 'installed'
    ? (query
        ? models.filter((m) => m.id.toLowerCase().includes(query.toLowerCase()))
        : models)
    : tab === 'catalogue'
    ? CATALOGUE_MODELS.filter((m) =>
        !installedIds.has(m.id) &&
        (!query || m.id.toLowerCase().includes(query.toLowerCase()) || m.desc.toLowerCase().includes(query.toLowerCase()))
      )
    : []; // cloud tab doesn't use filtered

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    void refreshCloudKeyStatus();
  }, [refreshCloudKeyStatus]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, tab]);

  useEffect(() => {
    if (pullSuccess) {
      const t = setTimeout(() => setPullSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [pullSuccess]);

  const handleSelect = async (modelId: string, owner?: string) => {
    const previousModel = selectedModel;
    setSelectedModel(modelId);
    setCommandPaletteOpen(false);

    if (modelId !== previousModel) {
      const { setModelLoading } = useAppStore.getState();
      setModelLoading(true);
      try {
        await preloadModel(modelId, owner);
      } catch (e: any) {
        toast.error(`Failed to load ${modelId}: ${e.message}`);
      } finally {
        setModelLoading(false);
      }
    }
  };

  const refreshModels = async () => {
    try {
      const m = await fetchModels();
      setModels(m);
    } catch {}
  };

  const handlePull = async (modelId: string) => {
    setPullError(null);
    const outcome = await startPull(modelId);
    if (outcome.result === 'done') {
      setPullSuccess(modelId);
      await refreshModels();
      setSelectedModel(modelId);
    } else if (outcome.result === 'error') {
      setPullError(outcome.message);
    }
  };

  const handleDelete = async (modelId: string) => {
    setDeleting(modelId);
    setConfirming(null);
    setPullError(null);
    try {
      await deleteModel(modelId);
      await refreshModels();
      if (selectedModel === modelId) {
        const remaining = models.filter((m) => m.id !== modelId);
        if (remaining.length > 0) setSelectedModel(remaining[0].id);
      }
    } catch (e: any) {
      setPullError(e.message || 'Could not uninstall the model');
    } finally {
      setDeleting(null);
    }
  };

  const handleCustomPull = async () => {
    const name = customModel.trim();
    if (!name) return;
    await handlePull(name);
    setCustomModel('');
  };

  const handleSaveKey = async (provider: CloudProvider, value: string) => {
    const keyValue = value.trim();
    setSavingKey(provider.envKey);
    setCloudKeyError(null);

    try {
      await saveCloudKey(provider.envKey, keyValue);
      setApiKeys((prev) => ({ ...prev, [provider.envKey]: '' }));
      await refreshCloudKeyStatus();
      await refreshModels();
    } catch (e: any) {
      setCloudKeyError(e?.message || `Failed to save ${provider.name} API key`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleKeyBlur = (provider: CloudProvider) => {
    const draft = apiKeys[provider.envKey] || '';
    if (draft.trim()) void handleSaveKey(provider, draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && tab === 'installed' && filtered.length > 0) {
      e.preventDefault();
      const model = filtered[selectedIdx] as (typeof models)[number];
      handleSelect(model.id, model.owned_by);
    }
  };

  const TAB_LABELS: Record<Tab, string> = {
    installed: `Installed Models (${models.length})`,
    catalogue: 'Download',
    cloud: 'Cloud Models',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />

      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45), var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs + close */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {(['installed', 'catalogue', 'cloud'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{
                  color: tab === t ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  background: tab === t ? 'var(--color-accent-subtle)' : 'transparent',
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => setCommandPaletteOpen(false)}
              className="p-1 rounded-lg cursor-pointer"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search (not for cloud tab) */}
        {tab !== 'cloud' && (
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <Search size={18} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tab === 'installed' ? 'Search installed models...' : 'Search models to download...'}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
        )}

        {/* Status messages */}
        {pullError && (
          <div className="px-4 py-2 text-xs" style={{ color: 'var(--color-error)', background: 'rgba(220,38,38,0.05)' }}>
            {pullError}
          </div>
        )}
        {pullSuccess && (
          <div className="px-4 py-2 text-xs flex items-center gap-1.5" style={{ color: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 5%, transparent)' }}>
            <Check size={12} /> Downloaded {pullSuccess} successfully
          </div>
        )}
        {tab === 'cloud' && cloudKeyError && (
          <div className="px-4 py-2 text-xs" style={{ color: 'var(--color-error)', background: 'rgba(220,38,38,0.05)' }}>
            {cloudKeyError}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto py-2">
          {tab === 'installed' ? (
            filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                {models.length === 0
                  ? 'No models available — switch to "Download" to get started'
                  : 'No matching models'}
              </div>
            ) : (
              (filtered as typeof models).map((model, idx) => {
                const isActive = model.id === selectedModel;
                const isSelected = idx === selectedIdx;
                const isDeleting = deleting === model.id;
                return (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 w-full px-4 py-2.5 transition-colors"
                    style={{ background: isSelected ? 'var(--color-bg-secondary)' : 'transparent' }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <button
                      onClick={() => handleSelect(model.id, model.owned_by)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0 }}
                    >
                      {model.owned_by === 'litellm' ? (
                        <Cloud size={16} style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} />
                      ) : (
                        <Cpu size={16} style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: isActive ? 500 : 400 }}>
                          {model.id}
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}>
                          Active
                        </span>
                      )}
                    </button>
                    {model.owned_by !== 'litellm' && (confirming === model.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Uninstall?</span>
                        <button onClick={() => setConfirming(null)} className="px-2.5 py-1 rounded-lg text-xs cursor-pointer"
                          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Keep</button>
                        <button onClick={() => handleDelete(model.id)} className="px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer"
                          style={{ background: 'var(--color-error)', color: '#fff' }}>Uninstall</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirming(model.id)}
                        disabled={isDeleting}
                        className="p-1 rounded transition-colors cursor-pointer shrink-0"
                        style={{ color: 'var(--color-text-tertiary)', opacity: 0.6 }}
                        title="Uninstall model"
                        aria-label={`Uninstall ${model.id}`}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-error)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                      >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    ))}
                  </div>
                );
              })
            )
          ) : tab === 'catalogue' ? (
            <>
              {(filtered as typeof CATALOGUE_MODELS).map((model) => {
                const isPulling = pulling === model.id;
                const justInstalled = pullSuccess === model.id;
                return (
                  <div key={model.id} className="w-full px-4 py-2.5">
                   <div className="flex items-center gap-3 w-full">
                    <Download size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{model.id}</div>
                      <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{model.desc}</div>
                    </div>
                    {!isPulling && <button
                      onClick={() => handlePull(model.id)}
                      disabled={isPulling || !!pulling}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
                      style={{
                        background: justInstalled ? 'var(--color-accent-subtle)' : 'var(--color-accent)',
                        color: justInstalled ? 'var(--color-accent)' : 'var(--color-on-accent)',
                        opacity: (isPulling || (pulling && !isPulling)) ? 0.5 : 1,
                      }}
                    >
                      {justInstalled ? <><Check size={12} /> Installed</> : <><Download size={12} /> Download</>}
                    </button>}
                   </div>
                   {isPulling && <DownloadBar model={model.id} progress={pullProgress} speed={pullSpeed} onCancel={cancelPull} />}
                  </div>
                );
              })}
              <div className="px-4 py-3 mt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="text-[11px] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Or Enter Any Ollama Model Name:</div>
                <div className="flex gap-2">
                  <input
                    type="text" value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCustomPull(); } }}
                    placeholder="e.g. codellama:7b"
                    className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  />
                  <button
                    onClick={handleCustomPull} disabled={!customModel.trim() || !!pulling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', opacity: (!customModel.trim() || pulling) ? 0.5 : 1 }}
                  >
                    <Download size={12} /> Pull
                  </button>
                </div>
                {pulling && !CATALOGUE_MODELS.some((m) => m.id === pulling) && (
                  <DownloadBar model={pulling} progress={pullProgress} speed={pullSpeed} onCancel={cancelPull} />
                )}
              </div>
            </>
          ) : (
            /* ── Cloud Models tab ── */
            <div className="px-4 py-2">
              {CLOUD_PROVIDERS.map((provider) => {
                const key = apiKeys[provider.envKey] || '';
                const hasSavedKey = !!cloudKeyStatus[provider.envKey];
                const hasKey = hasSavedKey || !!key.trim();
                const isVisible = showKeys[provider.envKey];
                const isSaving = savingKey === provider.envKey;

                return (
                  <div key={provider.name} className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud size={14} style={{ color: hasKey ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{provider.name}</span>
                      {hasKey && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-success) 10%, transparent)', color: 'var(--color-success)' }}>
                          Connected
                        </span>
                      )}
                    </div>

                    {/* API key input */}
                    <div className="flex gap-1.5 mb-2">
                      <div className="flex-1 flex items-center rounded-lg" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                        <Key size={12} className="ml-2.5 shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                        <input
                          type={isVisible ? 'text' : 'password'}
                          value={key}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.envKey]: e.target.value }))}
                          onBlur={() => handleKeyBlur(provider)}
                          placeholder={hasSavedKey ? 'Saved in secure storage' : provider.envKey}
                          disabled={!desktopKeyStorage || isSaving}
                          className="flex-1 text-xs px-2 py-1.5 bg-transparent outline-none font-mono"
                          style={{ color: 'var(--color-text)' }}
                        />
                        <button
                          onClick={() => setShowKeys((prev) => ({ ...prev, [provider.envKey]: !prev[provider.envKey] }))}
                          className="px-2 cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      {hasSavedKey && (
                        <button
                          onClick={() => handleSaveKey(provider, '')}
                          disabled={isSaving}
                          className="px-2 py-1 rounded-lg text-[10px] cursor-pointer"
                          style={{ color: 'var(--color-error)', border: '1px solid var(--color-error)', opacity: isSaving ? 0.5 : 1 }}
                        >
                          {isSaving ? 'Saving' : 'Remove'}
                        </button>
                      )}
                    </div>

                    {/* Models for this provider (only show if key is set) */}
                    {hasKey && (
                      <div className="ml-5 flex flex-col gap-1">
                        {provider.models.map((model) => {
                          const isActive = model.id === selectedModel;
                          return (
                            <button
                              key={model.id}
                              onClick={() => handleSelect(model.id)}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors"
                              style={{ background: isActive ? 'var(--color-accent-subtle)' : 'transparent' }}
                              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
                              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <Cloud size={12} style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs truncate" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: isActive ? 500 : 400 }}>
                                  {model.id}
                                </div>
                                <div className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                                  {model.desc}
                                </div>
                              </div>
                              {isActive && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}>
                                  Active
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="opacity-50">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>TypeSafe</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                    Coming Soon
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex-1 flex items-center rounded-lg" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                    <Key size={12} className="ml-2.5 shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                    <input
                      type="password"
                      value=""
                      disabled
                      readOnly
                      placeholder="JEV_API_KEY"
                      className="flex-1 text-xs px-2 py-1.5 bg-transparent outline-none font-mono"
                      style={{ color: 'var(--color-text)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-[11px]"
          style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}
        >
          {tab === 'installed' ? (
            <>
              <span><kbd className="font-mono">↑↓</kbd> Navigate</span>
              <span><kbd className="font-mono">Enter</kbd> Select</span>
              <span><kbd className="font-mono">Esc</kbd> Close</span>
            </>
          ) : tab === 'catalogue' ? (
            <span>Models Are Downloaded From The Ollama Registry</span>
          ) : (
            <span>Stored Only Locally</span>
          )}
        </div>
      </div>
    </div>
  );
}
