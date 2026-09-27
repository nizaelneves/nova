import { useAppStore } from '../../lib/store';
import { EFFORT_LABELS, EFFORT_LEVELS, type EffortLevel } from '../../lib/model-capabilities';

/**
 * Reasoning effort for Claude Code, as in the Claude app: the current level
 * above a Faster ... Smarter slider.
 */
export function EffortSlider() {
  const effort = useAppStore((s) => s.settings.cliEffort);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const index = Math.max(0, EFFORT_LEVELS.indexOf(effort));

  return (
    <div className="px-3 pt-2 pb-3">
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
  );
}
