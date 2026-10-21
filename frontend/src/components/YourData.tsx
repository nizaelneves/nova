import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, getBase } from '../lib/api';
import { ConversationList } from './Sidebar/ConversationList';
import { Icon } from './Icon';
import { SeedsLoader } from './SeedsLoader';
import { disintegrate } from '../lib/disintegrate';
import { DataSection } from './DataSection';

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
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="fin-wrap">
      <div className="set-grid">
        <DataSection />
        <div className="set-section fin-card">
          <h3>Chats</h3>
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

        <div className="set-section fin-card">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h3 className="set-inline-title">Voice History</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                What you said with the voice shortcut. It stays on this computer.
              </p>
            </div>
            <div className="flex items-center gap-2">
            <select
              value={retention}
              onChange={(e) => void changeRetention(Number(e.target.value))}
              aria-label="Keep voice history for"
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer"
              style={FIELD}
            >
              {RETENTION.map((r) => <option key={r.days} value={r.days}>{r.days === 0 ? 'Keep Forever' : `Keep For ${r.days} Days`}</option>)}
            </select>
              <button
                type="button"
                onClick={() => void removeAll()}
                disabled={!entries || entries.length === 0}
                className="set-btn"
                data-danger
                data-armed={confirmAll || undefined}
              >
                <Icon name="trash-bin-minimalistic" size={12} /> {confirmAll ? 'Click again to confirm' : 'Clear'}
              </button>
            </div>
          </div>

          {entries === null ? (
            <SeedsLoader />
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
                  <button type="button" onClick={(ev) => void disintegrate(ev.currentTarget.closest('li'), '#ff6b6b').then(() => remove(e.id))} aria-label="Delete entry" title="Delete" className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                    <Icon name="trash-bin-minimalistic" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
      </div>
    </div>
  );
}
