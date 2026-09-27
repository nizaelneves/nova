import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { EFFORT_LABELS, isCliModel } from '../../lib/model-capabilities';
import { useDismiss } from '../../hooks/useDismiss';
import { Icon } from '../Icon';
import { EffortSlider } from './EffortPicker';

const CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Sonnet', note: 'Balanced' },
  { id: 'opus', label: 'Opus', note: 'Most capable' },
  { id: 'haiku', label: 'Haiku', note: 'Fastest' },
];

/**
 * Picks a command-line engine. Choosing Claude Code lets you pick its model
 * and its effort. Codex CLI and Gemini CLI are on the way.
 */
export function EngineMenu({ disabled }: { disabled?: boolean }) {
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const effort = useAppStore((s) => s.settings.cliEffort);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, boxRef);
  const claudeOn = isCliModel(selectedModel);
  const current = CLAUDE_MODELS.find((m) => m.id === selectedModel);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="composer-chip"
        data-active={claudeOn}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        title="Command-line engine"
      >
        <Icon name="code" size={14} />
        {claudeOn ? `Claude Code · ${current?.label ?? selectedModel} · ${EFFORT_LABELS[effort]}` : 'CLI'}
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
          {claudeOn && (
            <>
              <div className="menu-heading">Model</div>
              <div className="flex gap-1 px-2 pb-1">
                {CLAUDE_MODELS.map((m) => (
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
          <div className="menu-heading">More engines</div>
          {['Codex CLI', 'Gemini CLI'].map((name) => (
            <div key={name} className="menu-item menu-soon" aria-disabled="true">
              <Icon name="code" size={18} />
              <span>
                <span className="menu-title">{name}</span>
                <span className="menu-note">Coming soon</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
