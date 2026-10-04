import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../../lib/store';
import {
  EFFORT_LABELS,
  isClaudeCliModel,
  isCodexCliModel,
} from '../../lib/model-capabilities';
import { useDismiss } from '../../hooks/useDismiss';
import { Icon } from '../Icon';
import { EffortSlider } from './EffortPicker';

const CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Sonnet', note: 'Balanced' },
  { id: 'opus', label: 'Opus', note: 'Most capable' },
  { id: 'haiku', label: 'Haiku', note: 'Fastest' },
];

const CODEX_MODELS = [
  { id: 'codex:default', label: 'Default', note: "Your Codex's own default model" },
  { id: 'codex:gpt-6-astra', label: 'Astra', note: 'Most capable' },
  { id: 'codex:gpt-6.1-sol', label: 'Sol', note: 'Near-Astra, lower cost' },
  { id: 'codex:gpt-6-luna', label: 'Luna', note: 'Most efficient' },
];

/**
 * Picks a command-line engine. Choosing Claude Code or Codex lets you pick its
 * model and its effort. Each one runs the CLI you already have installed and
 * signed in to, on your own plan.
 */
export function EngineMenu({ disabled }: { disabled?: boolean }) {
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const effort = useAppStore((s) => s.settings.cliEffort);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, boxRef);
  const claudeOn = isClaudeCliModel(selectedModel);
  const codexOn = isCodexCliModel(selectedModel);
  const active = claudeOn ? 'Claude Code' : codexOn ? 'Codex' : null;
  const models = claudeOn ? CLAUDE_MODELS : codexOn ? CODEX_MODELS : [];
  const current = models.find((m) => m.id === selectedModel);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="composer-chip"
        data-active={active !== null}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        title="Command-line engine"
      >
        <Icon name="code" size={14} />
        {active ? `${active} · ${current?.label ?? selectedModel} · ${EFFORT_LABELS[effort]}` : 'CLI'}
        <Icon name="alt-arrow-down" size={12} />
      </button>
      {open && (
        <div className="menu" style={{ left: 0, width: '18rem' }}>
          <button
            type="button"
            className="menu-item"
            data-selected={claudeOn}
            onClick={() => { if (!claudeOn) setSelectedModel('sonnet'); }}
          >
            <Icon name={claudeOn ? 'check-circle' : 'code'} size={18} />
            <span>
              <span className="menu-title">Claude Code</span>
              <span className="menu-note">Uses your Claude plan</span>
            </span>
          </button>
          <button
            type="button"
            className="menu-item"
            data-selected={codexOn}
            onClick={() => { if (!codexOn) setSelectedModel('codex:default'); }}
          >
            <Icon name={codexOn ? 'check-circle' : 'code'} size={18} />
            <span>
              <span className="menu-title">Codex CLI</span>
              <span className="menu-note">Uses your ChatGPT plan</span>
            </span>
          </button>
          {active && (
            <>
              <div className="menu-heading">Model</div>
              <div className="flex gap-1 px-2 pb-1">
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="composer-chip flex-1 justify-center"
                    data-active={selectedModel === m.id}
                    title={m.note}
                    onClick={() => setSelectedModel(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <EffortSlider />
            </>
          )}
        </div>
      )}
    </div>
  );
}
