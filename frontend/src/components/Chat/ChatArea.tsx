import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { VoiceVisualizer } from '../VoiceVisualizer';
import { SyncButton } from '../SyncButton';
import { Database, X } from 'lucide-react';
import { listConnectors } from '../../lib/connectors-api';

/**
 * The home screen. Phibe's conversation lives in the island, so this screen only keeps the
 * sky, the voice visualizer, the data-sources hint and the Sync button.
 */
export function ChatArea() {
  const navigate = useNavigate();

  // Check if any data sources are connected
  const [hasConnectedSources, setHasConnectedSources] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    listConnectors()
      .then((list) => setHasConnectedSources(list.some((c) => c.connected)))
      .catch(() => setHasConnectedSources(null));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Data sources banner */}
      {hasConnectedSources === false && !bannerDismissed && (
        <div
          className="mx-4 mb-2 flex items-center gap-3 px-4 py-3 rounded-lg text-sm shrink-0"
          style={{
            background: 'var(--color-accent-subtle)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Database size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>
            Connect your data sources (Gmail, iMessage, Slack, etc.) to get personalized answers.
          </span>
          <button
            onClick={() => navigate('/settings?tab=data-sources')}
            className="px-3 py-1 rounded text-xs font-medium cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', border: 'none' }}
          >
            Connect
          </button>
          <button
            onClick={() => setBannerDismissed(true)}
            className="p-1 rounded cursor-pointer"
            style={{ color: 'var(--color-text-tertiary)', background: 'transparent', border: 'none' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-4">
            <VoiceVisualizer />
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-3">
        <SyncButton />
      </div>
    </div>
  );
}
