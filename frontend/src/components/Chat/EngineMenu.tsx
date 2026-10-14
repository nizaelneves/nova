import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchClaudeCliStatus, startClaudeCliLogin } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import {
  EFFORT_LABELS,
  isClaudeCliModel,
  isCodexCliModel,
} from '../../lib/model-capabilities';
import { Icon } from '../Icon';
import { PickerModal, PickerRow } from '../PickerModal';
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
  const claudeOn = isClaudeCliModel(selectedModel);
  const codexOn = isCodexCliModel(selectedModel);
  const active = claudeOn || codexOn;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'claude' | 'codex'>(codexOn ? 'codex' : 'claude');
  const [status, setStatus] = useState<{ installed: boolean; signed_in: boolean } | null>(null);
  const [waiting, setWaiting] = useState(false); // the sign-in window is open
  const current = [...CLAUDE_MODELS, ...CODEX_MODELS].find((m) => m.id === selectedModel);
  const models = tab === 'claude' ? CLAUDE_MODELS : CODEX_MODELS;
  const needsSignIn = tab === 'claude' && status !== null && !status.signed_in;

  // Is Claude Code installed and signed in? Look when the pop-up opens, and every few seconds while the user signs in.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const check = () => fetchClaudeCliStatus().then((s) => { if (alive) { setStatus(s); if (s.signed_in) setWaiting(false); } }).catch(() => {});
    void check();
    if (!waiting) return () => { alive = false; };
    const id = window.setInterval(check, 3000);
    return () => { alive = false; window.clearInterval(id); };
  }, [open, waiting]);

  const signIn = async () => {
    try {
      const { opened } = await startClaudeCliLogin();
      if (opened) { setWaiting(true); toast.info('Finish signing in with Anthropic in the window that opened'); }
      else toast.error('Could not open a terminal. Run `claude` in your own terminal to sign in.', { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the sign-in');
    }
  };

  return (
    <>
      <button
        type="button"
        className="composer-chip"
        data-active={active}
        onClick={() => { setTab(codexOn ? 'codex' : 'claude'); setOpen(true); }}
        disabled={disabled}
        title="Command-line engine"
      >
        <Icon name="code" size={14} />
        {active ? `${current?.label ?? selectedModel} · ${EFFORT_LABELS[effort]}` : 'CLI'}
        <Icon name="alt-arrow-down" size={12} />
      </button>
      {open && (
        <PickerModal
          tabs={[{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex CLI' }]}
          tab={tab}
          onTab={setTab}
          onClose={() => setOpen(false)}
          footer={<span>{tab === 'claude' ? 'Uses your Claude plan' : 'Uses your ChatGPT plan'} · runs the CLI you already have signed in</span>}
        >
          {tab === 'claude' && status && !status.installed && (
            <PickerRow icon={<Icon name="arrow-down" size={16} />} title="Install Claude Code" note="Get the official app, then come back and sign in"
              onClick={() => window.open('https://claude.com/claude-code', '_blank', 'noopener')} />
          )}
          {tab === 'claude' && status?.installed && !status.signed_in && (
            <PickerRow icon={<Icon name="key-minimalistic" size={16} />} active
              title={waiting ? 'Waiting for you to sign in…' : 'Sign in with Claude'}
              note="Opens Anthropic's own sign-in. Phibe never sees your password or tokens."
              onClick={() => void signIn()} />
          )}
          {models.map((m) => (
            <PickerRow key={m.id} icon={<Icon name={selectedModel === m.id ? 'check-circle' : 'code'} size={16} />}
              title={m.label} note={m.note} active={selectedModel === m.id} soon={needsSignIn}
              onClick={() => { setSelectedModel(m.id); setOpen(false); }} />
          ))}
          <div className="px-4 pt-2 pb-1"><EffortSlider /></div>
        </PickerModal>
      )}
    </>
  );
}
