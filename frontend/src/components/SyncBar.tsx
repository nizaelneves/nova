import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchSyncSettings, saveSyncSettings, syncAllConnectors, type SyncSettings } from '../lib/api';
import { choiceLabel, choicesWith, DAILY } from '../lib/syncRhythm';
import { Icon } from './Icon';
import { Section, SettingRow, Switch } from './settingsParts';

/** Reads and saves the sync settings; every change reaches the server at once. */
export function useSyncSettings() {
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const reload = useCallback(() => { fetchSyncSettings().then(setSettings).catch(() => setSettings(null)); }, []);
  useEffect(reload, [reload]);
  const change = useCallback(async (changes: Partial<SyncSettings>) => {
    try {
      setSettings(await saveSyncSettings(changes));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
      reload();
    }
  }, [reload]);
  return { settings, change, reload };
}

/** The general rhythm for every connected source, at the top of Connections. */
export function SyncBar({ settings, change, reload }: { settings: SyncSettings | null; change: (c: Partial<SyncSettings>) => Promise<void>; reload: () => void }) {
  const [syncing, setSyncing] = useState(false);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await syncAllConnectors();
      setTimeout(() => { reload(); setSyncing(false); }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the sync');
      setSyncing(false);
    }
  };

  if (!settings) return null;
  return (
    <div className="set-root ds-sync-bar">
      <Section title="Synchronization">
        <SettingRow label="Automatic Sync" description="Works In The Background">
          <Switch on={settings.auto_enabled} label="Automatic Sync" onClick={() => void change({ auto_enabled: !settings.auto_enabled })} />
        </SettingRow>
        <SettingRow label="How Often">
          <select
            value={settings.interval_minutes}
            disabled={!settings.auto_enabled}
            onChange={(e) => void change({ interval_minutes: parseInt(e.target.value, 10) })}
            className="cursor-pointer disabled:opacity-50"
          >
            {choicesWith(settings.interval_minutes).map((m) => <option key={m} value={m}>{choiceLabel(m)}</option>)}
          </select>
        </SettingRow>
        {settings.interval_minutes === DAILY && (
          <SettingRow label="At What Time">
            <input
              type="time"
              value={settings.daily_time}
              disabled={!settings.auto_enabled}
              onChange={(e) => { if (e.target.value) void change({ daily_time: e.target.value }); }}
              className="cursor-pointer disabled:opacity-50"
            />
          </SettingRow>
        )}
        <SettingRow label="" description="Sync Every Connected Source">
          <button type="button" className="set-btn" onClick={syncNow} disabled={syncing}>
            <Icon name="refresh" size={14} className={syncing ? 'animate-spin' : undefined} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </SettingRow>
      </Section>
    </div>
  );
}
