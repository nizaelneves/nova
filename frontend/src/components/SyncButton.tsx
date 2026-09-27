import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { fetchSyncOverview, syncAllConnectors, type SyncOverview } from '../lib/api';
import { timeAgo } from '../lib/time';

function newest(overview: SyncOverview | null): string | null {
  const dates = (overview?.connectors ?? []).map((c) => c.last_sync).filter(Boolean) as string[];
  return dates.length ? dates.sort().slice(-1)[0] : null;
}

/**
 * One click syncs every connected source (Anytype and the others).
 * Shows the time of the last sync and reports what happened when it ends.
 */
export function SyncButton() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSyncOverview();
      setOverview(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().then((data) => data?.syncing && setBusy(true));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  // While syncing, look again every 2 seconds until every source is done.
  useEffect(() => {
    if (!busy) return;
    const look = async () => {
      const data = await refresh();
      if (data && !data.syncing) {
        setBusy(false);
        const failed = data.connectors.filter((c) => c.state === 'error');
        if (failed.length) {
          toast.error(`Sync problem: ${failed.map((c) => `${c.display_name} (${c.error ?? 'error'})`).join('; ')}`, {
            duration: 10000,
          });
        } else {
          toast.success(`Synced ${data.connectors.map((c) => c.display_name).join(', ')}`);
        }
        return;
      }
      timer.current = setTimeout(look, 2000);
    };
    timer.current = setTimeout(look, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [busy, refresh]);

  const start = async () => {
    try {
      const result = await syncAllConnectors();
      const problems = Object.entries(result.failed);
      if (problems.length) toast.error(problems.map(([id, why]) => `${id}: ${why}`).join('; '));
      if (result.started.length + result.already_syncing.length === 0 && problems.length === 0) {
        toast.info('No connected sources yet. Connect one in Data Sources.', {
          action: { label: 'Open', onClick: () => navigate('/data-sources') },
        });
        return;
      }
      setBusy(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the sync');
    }
  };

  const last = newest(overview);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs cursor-pointer transition-colors disabled:cursor-default"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
        title="Sync every connected source now"
      >
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} style={{ color: 'var(--color-accent)' }} />
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
      <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {overview && overview.connectors.length === 0
          ? 'No sources connected'
          : `Last sync: ${timeAgo(last)}`}
      </span>
    </div>
  );
}
