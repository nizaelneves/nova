import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Trash2, Upload } from 'lucide-react';
import { fetchDataFolder, openDataFolder } from '../lib/api';
import { useAppStore } from '../lib/store';
import { Icon } from './Icon';
import { Section, SettingRow } from './settingsParts';

/** Where Phibe keeps its files on this computer, with a button to open that folder. */
function DataFolderRow() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    fetchDataFolder().then((f) => setPath(f.path)).catch(() => setPath(null));
  }, []);

  const open = async () => {
    try {
      await openDataFolder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the folder');
    }
  };

  return (
    <SettingRow label="Phibe folder" description="Tasks, finances, memory, knowledge and settings are saved here">
      <div className="flex items-center gap-2 max-w-md">
        <code className="text-xs truncate px-2 py-1 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }} title={path ?? ''}>
          {path ?? 'Unavailable'}
        </code>
        <button
          type="button"
          onClick={() => void open()}
          disabled={!path}
          className="composer-icon shrink-0 disabled:opacity-40"
          title="Open in file explorer"
          aria-label="Open in file explorer"
        >
          <Icon name="folder" size={18} />
        </button>
      </div>
    </SettingRow>
  );
}

/** The folder of Phibe, and a way to take the conversations out, bring them back or wipe them. */
export function DataSection() {
  const conversations = useAppStore((s) => s.conversations);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleExport = () => {
    const data = localStorage.getItem('phibe-conversations') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phibe-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.version === 1) {
            localStorage.setItem('phibe-conversations', JSON.stringify(data));
            useAppStore.getState().loadConversations();
            toast.success('Conversations imported');
          }
        } catch {
          toast.error('That file is not a Phibe export');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    localStorage.removeItem('phibe-conversations');
    useAppStore.getState().loadConversations();
    setConfirmClear(false);
  };

  return (
    <Section title="Data">
      <DataFolderRow />
      <SettingRow label="Conversations" description={`${conversations.length} stored locally`}>
        <div className="flex gap-2">
          <button onClick={handleExport} className="set-btn"><Download size={12} /> Export</button>
          <button onClick={handleImport} className="set-btn"><Upload size={12} /> Import</button>
        </div>
      </SettingRow>
      <SettingRow label="Clear all data" description="Permanently delete all conversations">
        <button onClick={handleClear} className="set-btn" data-danger data-armed={confirmClear || undefined}>
          <Trash2 size={12} /> {confirmClear ? 'Click again to confirm' : 'Clear'}
        </button>
      </SettingRow>
    </Section>
  );
}
