import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu, Loader2 } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { preloadModel } from '../../lib/api';
import { isEmbedOnlyModel } from '../../lib/model-capabilities';

/** Model dropdown that lives inside the chat input; opens upward. */
export function ModelPicker() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const models = useAppStore((s) => s.models);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  const chatModels = models.filter((m) => !isEmbedOnlyModel(m.id));
  const current = selectedModel || serverInfo?.model || 'Select model';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = async (modelId: string) => {
    setOpen(false);
    if (modelId === selectedModel) return;
    setSelectedModel(modelId);
    const { setModelLoading, addLogEntry } = useAppStore.getState();
    setModelLoading(true);
    addLogEntry({ timestamp: Date.now(), level: 'info', category: 'model', message: `Switching to ${modelId}...` });
    try {
      await preloadModel(modelId);
      addLogEntry({ timestamp: Date.now(), level: 'info', category: 'model', message: `${modelId} loaded` });
    } catch (e: any) {
      addLogEntry({ timestamp: Date.now(), level: 'error', category: 'model', message: `Failed to load ${modelId}: ${e.message}` });
    } finally {
      setModelLoading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isStreaming}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Escolher modelo"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
        style={{
          color: 'var(--color-text-secondary)',
          background: open ? 'var(--color-bg-tertiary)' : 'color-mix(in srgb, var(--color-text) 5%, transparent)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-text) 5%, transparent)'; }}
      >
        {modelLoading ? (
          <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        ) : (
          <Cpu size={13} />
        )}
        <span className="max-w-[140px] truncate">{current}</span>
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 mb-2 min-w-[220px] max-h-[280px] overflow-y-auto rounded-xl py-1 z-40"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {chatModels.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Nenhum modelo instalado
            </div>
          )}
          {chatModels.map((m) => {
            const selected = m.id === selectedModel;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(m.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs cursor-pointer transition-colors"
                style={{ color: selected ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="flex-1 truncate">{m.id}</span>
                {selected && <Check size={13} style={{ color: 'var(--color-accent)' }} />}
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCommandPaletteOpen(true);
              }}
              className="w-full px-3 py-2 text-left text-xs cursor-pointer transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Mais modelos…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
