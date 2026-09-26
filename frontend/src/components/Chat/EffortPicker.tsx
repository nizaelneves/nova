import { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { EFFORT_LABELS, EFFORT_LEVELS, type EffortLevel } from '../../lib/model-capabilities';

/**
 * Reasoning effort for Claude CLI models, as in the Claude app: a chip showing
 * the current level that opens a Faster ... Smarter slider.
 */
export function EffortPicker({ disabled }: { disabled?: boolean }) {
  const effort = useAppStore((s) => s.settings.cliEffort);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const index = Math.max(0, EFFORT_LEVELS.indexOf(effort));

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
        title="Reasoning effort"
        aria-expanded={open}
      >
        <Gauge size={12} />
        {EFFORT_LABELS[effort]}
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-64 rounded-xl p-4 z-30"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.35))',
          }}
        >
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Effort</span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{EFFORT_LABELS[effort]}</span>
          </div>
          <input
            type="range"
            min={0}
            max={EFFORT_LEVELS.length - 1}
            step={1}
            value={index}
            onChange={(e) => {
              const level: EffortLevel = EFFORT_LEVELS[parseInt(e.target.value, 10)];
              updateSettings({ cliEffort: level });
            }}
            className="w-full cursor-pointer accent-[var(--color-accent)]"
            aria-label="Reasoning effort"
          />
          <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>Faster</span>
            <span>Smarter</span>
          </div>
        </div>
      )}
    </div>
  );
}
