import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../lib/store';
import { getBase } from '../lib/api';
import { Icon, type IconName } from '../components/Icon';
import { TerminalLine } from '../components/TerminalLine';
import { summarizeSources } from '../lib/sourcesSummary';
import { ToolCards } from '../components/ToolCards';
import { ChatSources } from '../components/ChatSources';
import { CLOUD_KEY_STATUS_CHANGED } from '../components/keys';
import { fetchAvailableTools, type ToolInfo } from '../lib/api';
import { SyncBar, useSyncSettings } from '../components/SyncBar';
import { ConnectorSettings, LEVEL_LABEL } from '../components/ConnectorSettings';
import {
  FolderOpen, FileText,
  Mail, Hash, MessageCircle, CalendarDays, StickyNote, BookText,
  Package, Upload, Link2, PhoneCall,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SOURCE_CATALOG } from '../types/connectors';
import { ConnectorLogo } from '../components/ConnectorLogo';
import { Popup } from '../components/Popup';
import type { ConnectRequest, ConnectorMeta, SyncStatus, OAuthSetupInfo } from '../types/connectors';
import { listConnectors, connectSource, disconnectSourceUntilComplete, getConnector, getSyncStatus, triggerSync, startServerOAuth, getPermissions, setPermission, type Level, type Permission } from '../lib/connectors-api';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Inline connect form (reused from AgentsPage pattern)
// ---------------------------------------------------------------------------

function InlineConnectForm({
  fields,
  loading,
  disabled = false,
  onSubmit,
}: {
  fields: NonNullable<ConnectorMeta['inputFields']>;
  loading: boolean;
  disabled?: boolean;
  onSubmit: (req: ConnectRequest) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue || ''])),
  );

  const update = (name: string, value: string) =>
    setInputs((p) => ({ ...p, [name]: value }));

  const allFilled = fields
    .filter((field) => field.required !== false)
    .every((field) => inputs[field.name]?.trim());
  const submitDisabled = loading || disabled || !allFilled;

  const submit = () => {
    const req: ConnectRequest = {};
    for (const f of fields) {
      if (f.name === 'email') req.email = inputs.email;
      else if (f.name === 'password') req.password = inputs.password;
      else if (f.name === 'token') req.token = inputs.token;
      else if (f.name === 'path') req.path = inputs.path;
      else if (f.name === 'host' && inputs.host?.trim()) req.host = inputs.host.trim();
      else if (f.name === 'port' && inputs.port?.trim()) req.port = Number(inputs.port);
      else if (f.name === 'security' && (inputs.security === 'tls' || inputs.security === 'starttls')) {
        req.security = inputs.security;
      }
      else req.config = { ...(req.config || {}), [f.name]: inputs[f.name] };
    }
    if (req.email && req.password) {
      req.token = `${req.email}:${req.password}`;
      req.code = req.token;
    }
    if (req.token && !req.code) req.code = req.token;
    onSubmit(req);
  };

  return (
    <div>
      {fields.map((f) => (
        f.type === 'select' ? (
          <select
            key={f.name}
            value={inputs[f.name] || f.defaultValue || ''}
            onChange={(e) => update(f.name, e.target.value)}
            aria-label={f.placeholder}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 4, color: 'var(--color-text)',
              fontSize: 12, marginBottom: 6,
              boxSizing: 'border-box',
            }}
          >
            {(f.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            key={f.name}
            value={inputs[f.name] || ''}
            onChange={(e) => update(f.name, e.target.value)}
            placeholder={f.placeholder}
            type={f.type || 'text'}
            required={f.required !== false}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 4, color: 'var(--color-text)',
              fontSize: 12, marginBottom: 6,
              boxSizing: 'border-box',
            }}
          />
        )
      ))}
      <button
        onClick={submit}
        disabled={submitDisabled}
        style={{
          width: '100%', padding: 8,
          background: submitDisabled ? 'var(--color-disabled-bg)' : 'var(--color-accent-purple)',
          color: 'var(--color-on-accent)', border: 'none',
          borderRadius: 6, fontSize: 12,
          cursor: submitDisabled ? 'default' : 'pointer',
        }}
      >
        Connect
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic fallback connect panel — for any backend connector that has no
// hardcoded SOURCE_CATALOG entry (no `steps`). Without this, expanding such
// a connector's "+ Add" card rendered nothing at all: no button, no input,
// no explanation, just an empty box (e.g. GitHub
// Notifications, Weather, and the Apple/News local sources).
// Branches on auth_type using the same primitives the hardcoded catalog
// entries already use (InlineConnectForm, oauth start+poll).
// ---------------------------------------------------------------------------

function GenericConnectPanel({
  connectorId,
  displayName,
  authType,
  loading,
  disabled = false,
  onConnect,
  onOAuthStart,
}: {
  connectorId: string;
  displayName: string;
  authType: string;
  loading: boolean;
  disabled?: boolean;
  onConnect: (req: ConnectRequest) => void;
  onOAuthStart: () => void;
}) {
  const [oauthSetup, setOauthSetup] = useState<OAuthSetupInfo | null>(null);
  const [feedUrls, setFeedUrls] = useState('');

  useEffect(() => {
    if (authType !== 'oauth') return;
    let cancelled = false;
    getConnector(connectorId)
      .then((info) => {
        if (!cancelled) setOauthSetup(info.oauth_setup ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectorId, authType]);

  if (authType === 'local') {
    if (connectorId === 'news_rss') {
      const feeds = feedUrls
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ url }));
      return (
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            Add one RSS or Atom feed URL per line.
          </div>
          <textarea
            value={feedUrls}
            onChange={(event) => setFeedUrls(event.target.value)}
            placeholder={'https://example.com/feed.xml\nhttps://example.org/rss'}
            rows={4}
            style={{ width: '100%', padding: '7px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
          />
          <button
            onClick={() => onConnect({ config: { feeds } })}
            disabled={loading || disabled || feeds.length === 0}
            style={{ width: '100%', padding: 8, background: loading || disabled || feeds.length === 0 ? 'var(--color-disabled-bg)' : 'var(--color-accent-purple)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 6, fontSize: 12, cursor: loading || disabled || feeds.length === 0 ? 'default' : 'pointer' }}
          >
            {loading ? 'Connecting...' : 'Save feeds'}
          </button>
        </div>
      );
    }
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
          {displayName} reads data directly from this device. Grant access if
          prompted, then connect.
        </div>
        <button
          onClick={() => onConnect({})}
          disabled={loading || disabled}
          style={{
            width: '100%', padding: 8,
            background: loading || disabled ? 'var(--color-disabled-bg)' : 'var(--color-accent-purple)',
            color: 'var(--color-on-accent)', border: 'none',
            borderRadius: 6, fontSize: 12,
            cursor: loading || disabled ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Connecting...' : `Connect ${displayName}`}
        </button>
      </div>
    );
  }

  if (authType === 'token') {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
          Enter your {displayName} API token.
        </div>
        <InlineConnectForm
          fields={connectorId === 'weather'
            ? [
                { name: 'token', placeholder: 'OpenWeather API key', type: 'password' },
                { name: 'location', placeholder: 'City, country (for example: Boston,US)', type: 'text' },
              ]
            : [{ name: 'token', placeholder: `${displayName} API token`, type: 'password' }]}
          loading={loading}
          disabled={disabled}
          onSubmit={onConnect}
        />
      </div>
    );
  }

  // auth_type === 'oauth' (default for anything else without a catalog entry)
  if (oauthSetup?.has_credentials) {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
          OAuth app credentials are already configured. Continue directly to
          {oauthSetup.provider ? ` ${oauthSetup.provider}` : ' the provider'} sign-in.
        </div>
        <button
          onClick={onOAuthStart}
          disabled={loading || disabled}
          style={{
            width: '100%', padding: 8,
            background: loading || disabled ? 'var(--color-disabled-bg)' : 'var(--color-accent-purple)',
            color: 'var(--color-on-accent)', border: 'none',
            borderRadius: 6, fontSize: 12,
            cursor: loading || disabled ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Connecting...' : `Continue with ${oauthSetup.provider || displayName}`}
        </button>
      </div>
    );
  }

  return (
    <div>
      {oauthSetup && !oauthSetup.has_credentials && (
        <div style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 6, padding: 10, marginBottom: 10,
        }}>
          <div style={{ color: 'var(--color-accent-purple)', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
            SETUP REQUIRED
          </div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>{oauthSetup.setup_hint}</div>
          <a
            href={oauthSetup.setup_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent)', fontSize: 11, textDecoration: 'underline' }}
          >
            Open developer dashboard &rarr;
          </a>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        Paste the Client ID and Client Secret from the app you created above.
      </div>
      <InlineConnectForm
        fields={[
          { name: 'email', placeholder: 'Client ID', type: 'text' },
          { name: 'password', placeholder: 'Client Secret', type: 'password' },
        ]}
        loading={loading}
        disabled={disabled}
        onSubmit={onConnect}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload / Paste form
// ---------------------------------------------------------------------------

const ACCEPTED_EXTENSIONS = '.txt,.md,.csv,.pdf,.docx,.xlsx,.pptx,.html,.htm,.json,.xml';

function UploadForm({ onDone }: { onDone?: () => void }) {
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const handlePaste = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const res = await fetch(`${getBase()}/v1/connectors/upload/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(`Added ${data.chunks_added} chunk${data.chunks_added !== 1 ? 's' : ''} to knowledge base`);
      setTitle('');
      setContent('');
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      if (title.trim()) formData.append('title', title.trim());

      const res = await fetch(`${getBase()}/v1/connectors/upload/ingest/files`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(`Added ${data.chunks_added} chunk${data.chunks_added !== 1 ? 's' : ''} from ${files.length} file${files.length !== 1 ? 's' : ''}`);
      setFiles([]);
      setTitle('');
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 0', textAlign: 'center',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? 'var(--color-accent-purple)' : 'transparent',
    color: active ? 'white' : 'var(--color-text-secondary)',
    border: 'none', borderRadius: 4,
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 4, color: 'var(--color-text)',
    fontSize: 12, marginBottom: 6,
    boxSizing: 'border-box' as const,
  };

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10,
        background: 'var(--color-bg)', borderRadius: 6, padding: 2 }}>
        <button style={tabStyle(tab === 'paste')} onClick={() => setTab('paste')}>
          Paste Text
        </button>
        <button style={tabStyle(tab === 'upload')} onClick={() => setTab('upload')}>
          Upload Files
        </button>
      </div>

      {/* Title input (shared) */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        style={inputStyle}
      />

      {tab === 'paste' && (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your text here..."
            rows={6}
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'inherit',
              minHeight: 100,
            }}
          />
          <button
            onClick={handlePaste}
            disabled={busy || !content.trim()}
            style={{
              width: '100%', padding: 8,
              background: busy || !content.trim() ? 'var(--color-disabled-bg)' : 'var(--color-accent-purple)',
              color: 'var(--color-on-accent)', border: 'none',
              borderRadius: 6, fontSize: 12, cursor: 'pointer',
            }}
          >
            {busy ? 'Adding...' : 'Add to Knowledge Base'}
          </button>
        </>
      )}

      {tab === 'upload' && (
        <>
          <input
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              setFiles(selected);
            }}
            style={{ ...inputStyle, padding: 6 }}
          />
          {files.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {files.map((f) => f.name).join(', ')}
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={busy || files.length === 0}
            style={{
              width: '100%', padding: 8,
              background: busy || files.length === 0 ? 'var(--color-disabled-bg)' : 'var(--color-accent-purple)',
              color: 'var(--color-on-accent)', border: 'none',
              borderRadius: 6, fontSize: 12, cursor: 'pointer',
            }}
          >
            {busy ? 'Uploading...' : 'Upload & Index'}
          </button>
        </>
      )}

      {result && (
        <div style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 8 }}>
          {result}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const iconMap: Record<string, LucideIcon> = {
  gmail: Mail,
  gmail_imap: Mail,
  gmail_api: Mail,
  slack: Hash,
  imessage: MessageCircle,
  whatsapp: PhoneCall,
  gdrive: FolderOpen,
  apple_notes: StickyNote,
  gcalendar: CalendarDays,
  upload: Upload,
};

const IconFor = ({ id, size = 18 }: { id: string; size?: number }) => {
  const Ico = iconMap[id] ?? Link2;
  return <Ico size={size} />;
};

// The Gmail card unifies the OAuth (`gmail`) and IMAP (`gmail_imap`) backend
// connectors — both should resolve to the gmail_imap catalog entry so the
// connected card shows the same name, unit label, and troubleshooting tips
// regardless of which underlying flow the user picked.
function metaFor(connectorId: string) {
  const id = connectorId === 'gmail' ? 'gmail_imap' : connectorId;
  return SOURCE_CATALOG.find((s) => s.connector_id === id);
}

// Advanced OAuth disclosure for the unified Gmail card. Hidden by default;
// expands to a Client ID + Client Secret form that POSTs to the OAuth
// `gmail` backend connector. Lives here rather than in SOURCE_CATALOG
// because the Gmail card is the only one with a dual-flow shape.
function GmailOAuthAdvanced({
  loading,
  disabled = false,
  onConnect,
}: {
  loading: boolean;
  disabled?: boolean;
  onConnect: (req: ConnectRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          textDecoration: 'underline',
        }}
      >
        {open ? 'Hide advanced' : 'Advanced: Connect with Google OAuth'}
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
            For developers with an existing Google Cloud project. Enable the
            Gmail API and create a Desktop OAuth client at{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
            >
              Google Cloud Credentials →
            </a>{' '}
            then paste the Client ID and Client Secret below.
          </div>
          <InlineConnectForm
            fields={[
              { name: 'email', placeholder: 'Client ID', type: 'text' },
              { name: 'password', placeholder: 'Client Secret', type: 'password' },
            ]}
            loading={loading}
            disabled={disabled}
            onSubmit={onConnect}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Sources section
// ---------------------------------------------------------------------------

// Sync status display component with progress bar
function formatTimeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return 'less than a min ago';
  if (diffSec < 3600) {
    const m = Math.round(diffSec / 60);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.round(diffSec / 3600);
    return `${h} hr${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.round(diffSec / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Render how far back the corpus extends, given the oldest indexed
 *  item's timestamp. Returns null when there isn't enough data yet. */
function formatBacklogRange(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = (Date.now() - t) / 86400_000;
  if (days < 7) return 'past few days';
  if (days < 30) return 'past month';
  if (days < 90) return 'past 3 months';
  if (days < 365) return 'past year';
  const years = Math.round(days / 365);
  return `past ${years} year${years === 1 ? '' : 's'}`;
}

export function SyncStatusDisplay({
  chunks,
  sync,
  unitLabel,
  connectorId,
  disabled = false,
  onSyncTriggered,
}: {
  chunks: number;
  sync: SyncStatus | undefined;
  unitLabel: string;
  connectorId: string;
  disabled?: boolean;
  onSyncTriggered: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  const handleSync = async () => {
    if (disabled || sync?.state === 'stopping') return;
    setSyncing(true);
    setSyncError('');
    try {
      await triggerSync(connectorId);
      onSyncTriggered();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Disconnect cleanup only begins after the active sync worker exits. Keep
  // every competing lifecycle action unavailable while the backend reports
  // this transitional state; the disconnect handler retries automatically.
  if (sync?.state === 'stopping') {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-warning)', marginBottom: 4 }}>
          Disconnect pending — waiting for the active sync to stop.
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
          Indexed data will be cleaned up before this source disconnects.
        </div>
      </div>
    );
  }

  // Error state
  if (sync?.error) {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-error)', marginBottom: 4 }}>
          Error: {sync.error}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || disabled}
          style={{
            fontSize: 10, padding: '2px 10px',
            background: 'var(--color-accent-purple)', color: 'var(--color-on-accent)',
            border: 'none', borderRadius: 3,
            cursor: syncing || disabled ? 'default' : 'pointer', fontWeight: 600,
            opacity: syncing || disabled ? 0.5 : 1,
          }}
        >{syncing ? 'Retrying...' : 'Retry Sync'}</button>
      </div>
    );
  }

  // Treat the SyncEngine's checkpointed items_synced as the source of
  // truth for "total indexed" — `chunks` from listConnectors counts
  // embedding chunks (often != source items) and the checkpoint is what
  // both the syncing and idle branches need to display consistently.
  const totalIndexed = sync?.items_synced ?? chunks;
  const itemsTotal = sync?.items_total ?? 0;
  const backlogRange = formatBacklogRange(sync?.oldest_item_date);
  // "Complete inbox" — the user has indexed everything reachable. Only
  // surface this label when idle (during a sync we always show how far
  // back we've gotten so far).
  const isComplete =
    totalIndexed > 0 && itemsTotal > 0 && totalIndexed >= itemsTotal;

  // Actively syncing — single status line + reassurance line.
  if (sync?.state === 'syncing' || syncing) {
    const rangeLabel = backlogRange ?? 'building corpus';
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-warning)', marginBottom: 4 }}>
          Indexed{' '}
          <span key={totalIndexed} className="sync-bump">
            {totalIndexed.toLocaleString()} {unitLabel}
          </span>{' '}
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            ({rangeLabel})
          </span>{' '}
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            · Still indexing…
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
          Muse available now · results improve as more {unitLabel} are indexed
        </div>
      </div>
    );
  }

  // Idle — already has indexed items: show the corpus size + range or
  // "complete inbox" label, plus how long ago we last refreshed it.
  if (totalIndexed > 0) {
    const lastSyncLabel = formatTimeAgo(sync?.last_sync);
    const rangeLabel = isComplete
      ? 'complete inbox'
      : backlogRange;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-success)' }}>
            Indexed {totalIndexed.toLocaleString()} {unitLabel}
            {rangeLabel && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                {' '}({rangeLabel})
              </span>
            )}
            {lastSyncLabel && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                {' · '}Last synced {lastSyncLabel}
              </span>
            )}
          </span>
          <button
            onClick={handleSync}
            disabled={syncing || disabled}
            style={{
              fontSize: 9, padding: '1px 6px',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: 3,
              cursor: syncing || disabled ? 'default' : 'pointer',
              opacity: syncing || disabled ? 0.5 : 1,
            }}
          >{syncing ? '...' : 'Re-sync'}</button>
        </div>
        {syncError && (
          <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4 }}>
            {syncError}
          </div>
        )}
      </div>
    );
  }

  // Connected but nothing ever ingested. Mirror the original copy.
  const hasSynced = sync?.last_sync != null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {hasSynced
            ? `Synced — 0 ${unitLabel} found`
            : 'Connected — not synced yet'}
        </span>
        <button
          onClick={handleSync}
          disabled={syncing || disabled}
          style={{
            fontSize: 10, padding: '2px 10px',
            background: 'var(--color-accent-purple)', color: 'var(--color-on-accent)',
            border: 'none', borderRadius: 3,
            cursor: syncing || disabled ? 'default' : 'pointer', fontWeight: 600,
            opacity: syncing || disabled ? 0.5 : 1,
          }}
        >{syncing ? 'Syncing...' : hasSynced ? 'Re-sync' : 'Sync Now'}</button>
      </div>
      {hasSynced && connectorId === 'slack' && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          Tip: invite the bot to channels with /invite @Phibe, then re-sync
        </div>
      )}
      {syncError && (
        <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4 }}>
          {syncError}
        </div>
      )}
    </div>
  );
}

type SourceView = 'All' | 'Connected' | 'Disconnected';
const SOURCE_VIEWS: { id: SourceView; icon: IconName }[] = [
  { id: 'All', icon: 'widget-2' },
  { id: 'Connected', icon: 'plug' },
  { id: 'Disconnected', icon: 'plug-off' },
];

function DataSourcesSection() {
  const cachedConnectors = useAppStore((s) => s.cachedConnectors);
  const setCachedConnectors = useAppStore((s) => s.setCachedConnectors);
  const connectors = cachedConnectors ?? [];
  const isFirstLoad = cachedConnectors === null;
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<{ id: string; message: string } | null>(null);
  const disconnectAbortRef = useRef<AbortController | null>(null);
  const [view, setView] = useState<SourceView>('All');
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const { settings: syncSettings, change: changeSync, reload: reloadSync } = useSyncSettings();
  const [perms, setPerms] = useState<Record<string, Permission>>({});
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  useEffect(() => { getPermissions().then(setPerms).catch(() => setPerms({})); }, []);
  const [authorizing, setAuthorizing] = useState(false);
  /** Opens Google's consent for what the source's level needs, then waits until the saved token matches it. */
  const authorize = async (id: string) => {
    setAuthorizing(true);
    window.open(`${getBase()}/v1/connectors/${encodeURIComponent(id)}/oauth/start`, '_blank', 'width=600,height=700');
    try {
      for (const deadline = Date.now() + 180_000; Date.now() < deadline;) {
        await new Promise((r) => setTimeout(r, 2000));
        const latest = await getPermissions().catch(() => null);
        if (latest && latest[id]?.google && !latest[id].google!.needs_authorization) {
          setPerms(latest);
          toast.success('Google access updated');
          return;
        }
      }
      toast.error('Google did not confirm in time. Try again.');
    } finally {
      setAuthorizing(false);
    }
  };
  const changeLevel = async (id: string, level: Level): Promise<boolean> => {
    try {
      await setPermission(id, level);
      setPerms(await getPermissions()); // Google's agreement with the new level is worked out by the server
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the permission');
      return false;
    }
  };
  useEffect(() => {
    const load = () => fetchAvailableTools().then(setTools).catch(() => setTools([]));
    void load();
    window.addEventListener(CLOUD_KEY_STATUS_CHANGED, load);
    return () => window.removeEventListener(CLOUD_KEY_STATUS_CHANGED, load);
  }, []);

  const loadConnectors = useCallback(async () => {
    try {
      const list = await listConnectors();
      setCachedConnectors(
        list.map((c) => ({
          connector_id: c.connector_id,
          display_name: c.display_name,
          connected: c.connected,
          chunks: (c as any).chunks || 0,
          auth_type: c.auth_type,
        })),
      );
    } catch {
      // The periodic refresh will try again.
    }
  }, [setCachedConnectors]);

  const setConnectors = setCachedConnectors;

  // Poll sync status for connected sources
  const loadSyncStatuses = useCallback(async () => {
    const connected = connectors.filter((c) => c.connected);
    const statuses: Record<string, SyncStatus> = {};
    await Promise.all(
      connected.map(async (c) => {
        try {
          statuses[c.connector_id] = await getSyncStatus(c.connector_id);
        } catch { /* */ }
      }),
    );
    setSyncStatuses((prev) => ({ ...prev, ...statuses }));
  }, [connectors]);

  useEffect(() => {
    void loadConnectors();
    const interval = setInterval(() => void loadConnectors(), 10000);
    return () => clearInterval(interval);
  }, [loadConnectors]);

  useEffect(() => {
    if (connectors.some((c) => c.connected)) {
      loadSyncStatuses();
      const interval = setInterval(loadSyncStatuses, 5000);
      return () => clearInterval(interval);
    }
  }, [connectors, loadSyncStatuses]);

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectStage, setConnectStage] = useState<string>('');
  const [connectError, setConnectError] = useState<string>('');

  useEffect(() => () => disconnectAbortRef.current?.abort(), []);

  const handleDisconnect = async (id: string) => {
    if (disconnectAbortRef.current || loading) return;
    const controller = new AbortController();
    disconnectAbortRef.current = controller;
    setDisconnectingId(id);
    setDisconnectError(null);
    try {
      await disconnectSourceUntilComplete(id, {
        signal: controller.signal,
        onPending: () => {
          setSyncStatuses((prev) => {
            const current = prev[id];
            return {
              ...prev,
              [id]: {
                state: 'stopping',
                items_synced: current?.items_synced ?? 0,
                items_total: current?.items_total ?? 0,
                new_items_synced: current?.new_items_synced ?? null,
                oldest_item_date: current?.oldest_item_date ?? null,
                last_sync: current?.last_sync ?? null,
                error: null,
              },
            };
          });
        },
      });
      setSyncStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadConnectors();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setDisconnectError({
          id,
          message: err instanceof Error ? err.message : 'Disconnect failed',
        });
      }
    } finally {
      if (disconnectAbortRef.current === controller) {
        disconnectAbortRef.current = null;
        setDisconnectingId(null);
      }
    }
  };

  const handleConnect = async (id: string, req: ConnectRequest | null) => {
    if (loading || disconnectAbortRef.current) return;
    setLoading(true);
    setConnectingId(id);
    setConnectStage('Connecting...');
    setConnectError('');
    try {
      const resp = req === null ? null : await connectSource(id, req);

      // OAuth connectors (Google Drive/Calendar/Contacts/Gmail/Tasks): pasting
      // a Client ID / Secret only registers the app credentials. The backend
      // returns `oauth_required` with the path to the in-process consent flow,
      // which is the only path that actually mints an access token. Open it now
      // and wait for the callback to flip the connector to connected. Without
      // this the connector would stay "pending" forever — the exact #512 bug.
      if (req === null || resp?.status === 'oauth_required') {
        setConnectStage('Opening provider sign-in...');
        await startServerOAuth(id, resp?.oauth_start);
      }

      setConnectStage('Connected! Starting sync...');

      // Wait for connector to show as connected
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const updated = await listConnectors();
        const target = updated.find((c) => c.connector_id === id);
        if (target?.connected) {
          setConnectors(updated.map((c) => ({
            connector_id: c.connector_id,
            display_name: c.display_name,
            connected: c.connected,
            chunks: (c as any).chunks || 0,
            auth_type: c.auth_type,
          })));
          break;
        }
        setConnectStage(i < 5 ? 'Authenticating...' : 'Waiting for connection...');
      }

      // Trigger sync
      setConnectStage('Syncing data...');
      try {
        await triggerSync(id);
      } catch { /* sync may already be running */ }

      // Close form after a brief moment
      await new Promise((r) => setTimeout(r, 1500));
      setExpandedId(null);
      loadConnectors();
      loadSyncStatuses();
    } catch (err: any) {
      let errorMsg = err.message || 'Connection failed';
      if (id === 'gmail_imap' && (errorMsg.includes('auth') || errorMsg.includes('credentials') || errorMsg.includes('LOGIN'))) {
        errorMsg = 'Invalid credentials — make sure you\'re using an App Password (16 characters), not your regular Gmail password.';
      }
      setConnectError(errorMsg);
      setConnectStage('');
    } finally {
      setLoading(false);
      setConnectingId(null);
      setConnectStage('');
    }
  };

  // Merge the OAuth Gmail (`gmail`) and IMAP Gmail (`gmail_imap`) backend
  // connectors into a single user-facing Gmail card. IMAP is the default
  // flow (no Google Cloud setup needed); OAuth lives behind an "Advanced"
  // disclosure when the card is expanded. If both happen to be connected,
  // keep whichever has more indexed chunks so the active source still
  // surfaces its sync state.
  const unifiedConnectors = (() => {
    const gmail = connectors.find((c) => c.connector_id === 'gmail');
    const gmailImap = connectors.find((c) => c.connector_id === 'gmail_imap');
    if (!gmail || !gmailImap) return connectors;
    if (gmail.connected && !gmailImap.connected) {
      return connectors.filter((c) => c.connector_id !== 'gmail_imap');
    }
    if (gmailImap.connected && !gmail.connected) {
      return connectors.filter((c) => c.connector_id !== 'gmail');
    }
    if (gmail.connected && gmailImap.connected) {
      const dropId = gmail.chunks >= gmailImap.chunks ? 'gmail_imap' : 'gmail';
      return connectors.filter((c) => c.connector_id !== dropId);
    }
    // Neither connected — show only the IMAP card as the default flow.
    return connectors.filter((c) => c.connector_id !== 'gmail');
  })();

  const connected = unifiedConnectors.filter((c) => c.connected);
  const notConnectedBase = unifiedConnectors.filter((c) => !c.connected);
  // Always show the upload card in the not-connected list (it has no backend connector)
  const uploadEntry = { connector_id: 'upload', display_name: 'Upload / Paste', connected: false, chunks: 0, auth_type: 'local' };
  const notConnected = notConnectedBase.some((c) => c.connector_id === 'upload')
    ? notConnectedBase
    : [...notConnectedBase, uploadEntry];
  const connectorActionsBusy = loading || disconnectingId !== null;

  const header = (
    <header className="fin-header">
      <TerminalLine text={isFirstLoad ? 'Loading your sources…' : summarizeSources(
        [...connected, ...notConnected].filter((c) => c.connector_id !== 'upload').map((c) => ({
          connected: c.connected, chunks: c.chunks, failing: !!syncStatuses[c.connector_id]?.error,
        })),
        tools ? { ready: tools.filter((t) => t.configured).length, total: tools.length } : undefined,
      )} />
      <div className="fin-controls">
        <div className="fin-actions" role="tablist" aria-label="Source views">
          {SOURCE_VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} data-active={view === v.id}
              className="fin-act" aria-label={v.id} title={v.id} onClick={() => setView(v.id)}>
              <Icon name={v.icon} size={16} />
              <span>{v.id}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
  const syncBar = <SyncBar settings={syncSettings} change={changeSync} reload={reloadSync} />;

  if (isFirstLoad) {
    return (
      <div className="fin-root h-full overflow-y-auto">
        <div className="fin-wrap">
          {header}
          {syncBar}
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="source-card data-skeleton" style={{ padding: '14px 18px', height: 60, opacity: 0.6 - i * 0.08 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const renderPanel = (c: (typeof connectors)[number]) => {
    const meta = metaFor(c.connector_id);
    const isExpanded = expandedId === c.connector_id;
    return (
      <>
                {isExpanded && c.connector_id === 'upload' && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                      Paste text or upload files (PDF, Word, Excel, PowerPoint, CSV, HTML, text). They are converted to Markdown and added to your knowledge base.
                    </div>
                    <UploadForm onDone={loadConnectors} />
                  </div>
                )}

                {isExpanded && c.connector_id !== 'upload' && meta?.steps && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                    {meta.steps.map((step, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 6, padding: 10,
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ color: 'var(--color-accent-purple)', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
                          STEP {i + 1}
                        </div>
                        <div style={{ fontSize: 12, marginBottom: step.url ? 4 : 0 }}>{step.label}</div>
                        {step.url && (
                          <a
                            href={step.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-accent)', fontSize: 11, textDecoration: 'underline' }}
                          >
                            {step.urlLabel || 'Open'} &rarr;
                          </a>
                        )}
                      </div>
                    ))}
                    {meta?.inputFields && (
                      <InlineConnectForm
                        fields={meta.inputFields}
                        loading={loading && connectingId === c.connector_id}
                        disabled={connectorActionsBusy}
                        onSubmit={(req) => handleConnect(c.connector_id, req)}
                      />
                    )}
                    {c.connector_id === 'gmail_imap' && (
                      <GmailOAuthAdvanced
                        loading={loading && connectingId === 'gmail'}
                        disabled={connectorActionsBusy}
                        onConnect={(req) => handleConnect('gmail', req)}
                      />
                    )}
                    {meta?.troubleshooting && (
                      <details className="mt-2">
                        <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                          Having trouble?
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {meta.troubleshooting.map((tip: string, i: number) => (
                            <li key={i} className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {/* Connection progress */}
                    {connectingId === c.connector_id && connectStage && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, color: 'var(--color-warning)',
                        }}>
                          <div className="animate-spin" style={{
                            width: 12, height: 12, borderRadius: '50%',
                            border: '2px solid var(--color-warning)',
                            borderTopColor: 'transparent',
                          }} />
                          {connectStage}
                        </div>
                        <div style={{
                          height: 3, borderRadius: 2, marginTop: 6,
                          background: 'var(--color-bg-tertiary)',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2, background: 'var(--color-warning)',
                            width: connectStage.includes('Sync') ? '75%' : connectStage.includes('Connected') ? '50%' : '25%',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    )}
                    {/* Connection error */}
                    {connectError && connectingId === null && expandedId === c.connector_id && (
                      <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 6 }}>
                        {connectError}
                      </div>
                    )}
                  </div>
                )}

                {isExpanded && c.connector_id !== 'upload' && !meta?.steps && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                    <GenericConnectPanel
                      connectorId={c.connector_id}
                      displayName={meta?.display_name ?? c.display_name}
                      authType={c.auth_type || 'oauth'}
                      loading={loading && connectingId === c.connector_id}
                      disabled={connectorActionsBusy}
                      onConnect={(req) => handleConnect(c.connector_id, req)}
                      onOAuthStart={() => handleConnect(c.connector_id, null)}
                    />
                    {connectingId === c.connector_id && connectStage && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning)' }}>
                        {connectStage}
                      </div>
                    )}
                    {connectError && connectingId === null && expandedId === c.connector_id && (
                      <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 6 }}>
                        {connectError}
                      </div>
                    )}
                  </div>
                )}
      </>
    );
  };

  const shownTools = (tools ?? []).filter((t) => (view === 'All' ? true : view === 'Connected' ? t.configured : !t.configured));
  const nameOf = (c: (typeof connected)[number]) => metaFor(c.connector_id)?.display_name ?? c.display_name;
  const cards = (view === 'Connected' ? connected : view === 'Disconnected' ? notConnected : [...connected, ...notConnected])
    .slice()
    .sort((x, y) => nameOf(x).localeCompare(nameOf(y), undefined, { sensitivity: 'base' }));

  return (
    <div className="fin-root h-full overflow-y-auto">
      <div className="fin-wrap">
      {header}
      <div className="ds-pair">
        {syncBar}
        <ChatSources />
      </div>
      <h3 className="ds-sec">Sources</h3>
      <div className="ds-grid">
        {cards.map((c) => {
          const meta = metaFor(c.connector_id);
          const on = c.connected;
          const isUpload = c.connector_id === 'upload';
          const isExpanded = expandedId === c.connector_id;
          const sync = syncStatuses[c.connector_id];
          const busy = disconnectingId === c.connector_id || (loading && connectingId === c.connector_id);
          const name = meta?.display_name ?? c.display_name;
          return (
            <div
              key={c.connector_id}
              className="ds-card"
              data-on={on || undefined}
              data-error={(on && !!sync?.error) || undefined}
            >
              <div className="ds-top">
                <ConnectorLogo id={c.connector_id} size={44} />
                {isUpload ? (
                  <button type="button" className="ds-add" onClick={() => setExpandedId(isExpanded ? null : c.connector_id)}>
                    {isExpanded ? 'Close' : '+ Add'}
                  </button>
                ) : (
                  <span className="ds-ctl">
                  {on && <button type="button" className="ds-gear" aria-label={`${name} settings`} title="Settings" onClick={() => setSettingsFor(c.connector_id)}><Icon name="settings" size={16} /></button>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${name}: ${on ? 'connected' : 'not connected'}`}
                    className="ds-switch"
                    data-on={on || undefined}
                    data-pending={(!on && isExpanded) || undefined}
                    data-busy={busy || undefined}
                    disabled={connectorActionsBusy && !busy}
                    onClick={() => {
                      if (busy) return;
                      if (on) { if (sync?.state === 'stopping') void handleDisconnect(c.connector_id); else setConfirmOff(c.connector_id); }
                      else setExpandedId(isExpanded ? null : c.connector_id);
                    }}
                  >
                    <i />
                  </button>
                  </span>
                )}
              </div>
              <div className="ds-name">{name}</div>
              <div className="ds-desc">{meta?.description ?? (on ? 'Connected' : 'Not connected')}</div>
              {on && !isUpload && <span className="ds-perm" data-level={perms[c.connector_id]?.level ?? 'read'}>{LEVEL_LABEL[perms[c.connector_id]?.level ?? 'read']}</span>}

              {on && (
                <div className="ds-sync">
                  <SyncStatusDisplay
                    chunks={c.chunks}
                    sync={sync}
                    unitLabel={meta?.unitLabel || 'items'}
                    connectorId={c.connector_id}
                    disabled={connectorActionsBusy}
                    onSyncTriggered={loadConnectors}
                  />
                </div>
              )}
              {disconnectError?.id === c.connector_id && (
                <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 6 }}>Disconnect failed: {disconnectError.message}</div>
              )}
              {busy && disconnectingId === c.connector_id && (
                <div className="ds-note">{sync?.state === 'stopping' ? 'Cleaning up…' : 'Disconnecting…'}</div>
              )}
              {confirmOff === c.connector_id && (
                <div className="ds-confirm">
                  <span>Turn off {name}? Its synced data is removed from Phibe.</span>
                  <div>
                    <button type="button" onClick={() => setConfirmOff(null)}>Keep On</button>
                    <button type="button" data-danger onClick={() => { setConfirmOff(null); void handleDisconnect(c.connector_id); }}>Turn Off</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {shownTools.length > 0 && (
        <>
          <h3 className="ds-sec">Tools</h3>
          <ToolCards tools={shownTools} />
        </>
      )}
      {expandedId && (() => {
        const c = cards.find((x) => x.connector_id === expandedId);
        if (!c || c.connected) return null;
        return (
          <Popup title={`Connect ${metaFor(c.connector_id)?.display_name ?? c.display_name}`} onClose={() => setExpandedId(null)} wide>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>{renderPanel(c)}</div>
          </Popup>
        );
      })()}
      {settingsFor && (() => {
        const c = cards.find((x) => x.connector_id === settingsFor);
        if (!c) return null;
        const sync = syncStatuses[c.connector_id];
        const meta = metaFor(c.connector_id);
        const items = sync?.items_synced ?? c.chunks;
        const last = formatTimeAgo(sync?.last_sync);
        return (
          <ConnectorSettings
            id={c.connector_id}
            name={meta?.display_name ?? c.display_name}
            permission={perms[c.connector_id] ?? { level: 'read', actions: {} }}
            onLevel={(level) => changeLevel(c.connector_id, level)}
            onAuthorize={() => void authorize(c.connector_id)}
            authorizing={authorizing}
            sync={syncSettings}
            onChangeSync={changeSync}
            statusLine={sync?.error ? `Error: ${sync.error}` : sync?.state === 'syncing' ? 'Syncing…' : items > 0 ? `${items.toLocaleString()} ${meta?.unitLabel || 'items'}${last ? ` · Last synced ${last}` : ''}` : 'Not synced yet'}
            syncing={syncingNow || sync?.state === 'syncing'}
            onSyncNow={async () => { setSyncingNow(true); try { await triggerSync(c.connector_id); } catch (e) { toast.error(e instanceof Error ? e.message : 'Sync failed'); } finally { setSyncingNow(false); void loadConnectors(); void loadSyncStatuses(); } }}
            onDisconnect={() => { setSettingsFor(null); setConfirmOff(c.connector_id); }}
            onClose={() => setSettingsFor(null)}
          />
        );
      })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DataSourcesPage() {
  return <DataSourcesSection />;
}
