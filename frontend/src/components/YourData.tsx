import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, getBase } from '../lib/api';
import { ConversationList } from './Sidebar/ConversationList';
import { Icon } from './Icon';

interface VoiceEntry {
  id: string;
  created_at: number;
  text: string;
  seconds: number;
  has_audio: boolean;
}

const RETENTION: { days: number; label: string }[] = [
  { days: 15, label: '15 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 0, label: 'Never' },
];

const FIELD: React.CSSProperties = { background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };

/**
 * Personal data Phibe keeps on this computer, with a way to see it and delete it. For now that is
 * the voice history; attachments and memories can get their own section here later.
 */
export function YourData() {
  const [entries, setEntries] = useState<VoiceEntry[] | null>(null);
  const [retention, setRetention] = useState(30);
  const [playing, setPlaying] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [chatQuery, setChatQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/voice/history');
      const data = await res.json();
      setEntries(data.items ?? []);
      setRetention(data.retention_days ?? 30);
    } catch {
      setEntries([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const changeRetention = async (days: number) => {
    setRetention(days);
    await apiFetch('/v1/voice/retention', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) });
    void load();
  };

  const remove = async (id: string) => {
    await apiFetch(`/v1/voice/history/${id}`, { method: 'DELETE' });
    setEntries((list) => (list ?? []).filter((e) => e.id !== id));
  };

  const removeAll = async () => {
    if (!confirmAll) {
      setConfirmAll(true);
      setTimeout(() => setConfirmAll(false), 3000);
      return;
    }
    await apiFetch('/v1/voice/history', { method: 'DELETE' });
    setConfirmAll(false);
    setEntries([]);
    toast.success('All voice data deleted');
  };

  const play = (id: string) => {
    setPlaying(id);
    const audio = new Audio(`${getBase()}/v1/voice/history/${id}/audio`);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <div className="rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Chats</h3>
          <p className="text-xs mt-1 mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
            Every conversation you had with Phibe. Open one to continue it, or delete it.
          </p>
          <input
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-2"
            style={FIELD}
          />
          <div className="max-h-80 overflow-y-auto">
            <ConversationList searchQuery={chatQuery} />
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Voice history</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                What you said with the voice shortcut, with the recording. It stays on this computer.
              </p>
            </div>
            <select
              value={retention}
              onChange={(e) => void changeRetention(Number(e.target.value))}
              aria-label="Keep voice history for"
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer"
              style={FIELD}
            >
              {RETENTION.map((r) => <option key={r.days} value={r.days}>Keep {r.label.toLowerCase() === 'never' ? 'forever' : `for ${r.label}`}</option>)}
            </select>
          </div>

          {entries === null ? (
            <div className="text-sm py-4" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>Nothing here yet.</div>
          ) : (
            <ul className="flex flex-col mt-3">
              {entries.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: 'var(--color-text)' }}>{e.text}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                      {new Date(e.created_at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {Math.round(e.seconds)} s
                    </div>
                  </div>
                  {e.has_audio && (
                    <button type="button" onClick={() => play(e.id)} aria-label="Play recording" title="Play recording" className="p-1 rounded cursor-pointer" style={{ color: playing === e.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                      <Icon name="play-circle" size={16} />
                    </button>
                  )}
                  <button type="button" onClick={() => void remove(e.id)} aria-label="Delete entry" title="Delete" className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                    <Icon name="trash-bin-minimalistic" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => void removeAll()}
            disabled={!entries || entries.length === 0}
            className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-default"
            style={{ ...FIELD, color: confirmAll ? 'var(--color-error)' : 'var(--color-text)' }}
          >
            {confirmAll ? 'Click again to delete everything' : 'Delete all voice data'}
          </button>
        </div>
      </div>
    </div>
  );
}
