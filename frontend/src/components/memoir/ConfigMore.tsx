import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { Pick } from './Pick';
import { useAppStore } from '../../lib/store';
import { memoirChats } from '../../lib/memoirChats';
import { loadVoiceSettings, saveVoiceSettings, type VoiceData } from '../../lib/voiceSettings';

const when = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const secs = (list: number[]) => list.map((s) => ({ value: String(s), label: `${s} seconds` }));

/** Voice (in General): when Phibe speaks her replies in the Memoir chat, and the timing of the voice card. */
export function MemoirVoice() {
  const speak = useAppStore((s) => s.settings.memoirVoiceReplies);
  const update = useAppStore((s) => s.updateSettings);
  const [data, setData] = useState<VoiceData | null>(null);
  useEffect(() => { loadVoiceSettings().then(setData).catch(() => setData(null)); }, []);
  const save = (next: VoiceData) => { saveVoiceSettings(next).then(setData).catch((e) => toast.error(typeof e === 'string' ? e : 'Could not save the voice settings')); };
  return (
    <div className="mm-cfg-card">
      <h4>Voice</h4>
      <div className="mm-vgrid">
        <div><span>Voice Mode</span>
          <Pick label="Voice Mode" value={speak} onChange={(v) => update({ memoirVoiceReplies: v as 'voice' | 'always' | 'off' })}
            options={[{ value: 'voice', label: 'When I Speak To Her' }, { value: 'always', label: 'Always' }, { value: 'off', label: 'Never' }]} /></div>
        {data && <>
          <div><span>Silence Countdown</span><Pick label="Silence Countdown" value={String(data.silence_secs)} onChange={(v) => save({ ...data, silence_secs: Number(v) })} options={secs([3, 5, 7, 10, 15, 20])} /></div>
          <div><span>Stop Countdown</span><Pick label="Stop Countdown" value={String(data.countdown_secs)} onChange={(v) => save({ ...data, countdown_secs: Number(v) })} options={secs([3, 5, 8, 10])} /></div>
        </>}
      </div>
    </div>
  );
}

/** Your Data: the Memoir chats only (Phibe's own are in Phibe's Settings). Rename or delete them here. */
export function MemoirChats() {
  const all = useAppStore((s) => s.conversations);
  const rename = useAppStore((s) => s.renameConversation);
  const remove = useAppStore((s) => s.deleteConversation);
  const chats = useMemo(() => memoirChats(all), [all]);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const commit = () => { if (editing) rename(editing.id, editing.name); setEditing(null); };
  return (
    <div className="mm-cfg-card">
      <h4>Conversations</h4>
      {chats.length === 0 ? <p className="mm-hint">No Conversations Yet.</p> : (
        <ol className="mm-trash-list">
          {chats.map((c) => (
            <li key={c.id}>
              <div>
                {editing?.id === c.id
                  ? <input autoFocus value={editing.name} aria-label="Conversation Name" onChange={(e) => setEditing({ id: c.id, name: e.target.value })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }} />
                  : <b>{c.title}</b>}
                <small>{c.messages.length} {c.messages.length === 1 ? 'Message' : 'Messages'} · Updated {when(c.updatedAt)}</small>
              </div>
              <button type="button" className="mm-btn" onClick={() => setEditing({ id: c.id, name: c.title })}><Icon name="edit" size={14} />Rename</button>
              <button type="button" className="mm-btn mm-danger" onBlur={() => setSure(null)} onClick={() => { if (sure === c.id) { remove(c.id); setSure(null); } else setSure(c.id); }}><Icon name="trash-bin-2" size={14} />{sure === c.id ? 'Sure?' : 'Delete'}</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
