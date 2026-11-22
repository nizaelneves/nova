import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSourcesMode, setSourcesMode, type SourcesMode } from '../lib/personaFiles';
import { Cycler } from './Cycler';
import { Icon } from './Icon';

const MODES: { id: SourcesMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'When Question Points a Source (RSS, Mail, Calendar, Drive, Notes).' },
  { id: 'always', label: 'Always', hint: 'Every question is searched against your sources. Uses more context.' },
  { id: 'off', label: 'Off', hint: 'Chat never reads your sources.' },
];

/** Connections: whether the chat may read the connected sources, at most about 600 tokens per answer. */
export function ChatSources() {
  const [mode, setMode] = useState<SourcesMode | null>(null);
  useEffect(() => { getSourcesMode().then(setMode).catch(() => setMode(null)); }, []);
  const change = async (next: SourcesMode) => {
    try { setMode(await setSourcesMode(next)); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); }
  };
  if (!mode) return null;
  return (
    <div className="ds-card" data-on>
      <div className="ds-top">
        <div className="logo-tile" style={{ width: 44, height: 44 }} aria-hidden="true">
          <Icon name="chat-round-dots" size={22} />
        </div>
        <div style={{ width: 132 }}>
          <Cycler ariaLabel="Sources in chat" value={mode} onChange={(m) => void change(m)} options={MODES.map((m) => ({ value: m.id, label: m.label }))} />
        </div>
      </div>
      <div className="ds-name">Sources In Chat</div>
      <div className="ds-desc">{MODES.find((m) => m.id === mode)?.hint}</div>
    </div>
  );
}
