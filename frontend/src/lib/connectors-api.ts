import { apiFetch, getBase } from './api';
import type { ConnectorInfo, SyncStatus, ConnectRequest, ConnectResponse } from '../types/connectors';

// ---------------------------------------------------------------------------
// Connectors API
// ---------------------------------------------------------------------------
//
// Every call here must go through apiFetch() (not a bare fetch()) so the
// Bearer auth header is attached when PHIBE_API_KEY is set -- direct
// fetch() calls silently 401 against an authenticated server, exactly the
// bug apiFetch was introduced to prevent elsewhere (#266). This file was
// missed when that fix landed.

export async function listConnectors(): Promise<ConnectorInfo[]> {
  const res = await apiFetch('/v1/connectors');
  if (!res.ok) throw new Error(`Failed to list connectors: ${res.status}`);
  const data = await res.json();
  return data.connectors || [];
}

export async function getConnector(id: string): Promise<ConnectorInfo> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to get connector ${id}: ${res.status}`);
  return res.json();
}

export async function connectSource(id: string, req: ConnectRequest): Promise<ConnectResponse> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    // Surface the backend's actionable detail (e.g. malformed Client ID /
    // Secret) instead of a bare status code so the UI can render it.
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to connect ${id}: ${res.status}`);
  }
  return res.json();
}

/** Open the server-side OAuth consent flow in a popup and resolve once the
 *  connector reports connected (or reject on timeout). Reused for any OAuth
 *  connector whose /connect returned `oauth_required` (issue #512). */
export function startServerOAuth(id: string, oauthStartPath?: string): Promise<void> {
  const path = oauthStartPath || `/v1/connectors/${encodeURIComponent(id)}/oauth/start`;
  window.open(`${getBase()}${path}`, '_blank', 'width=600,height=700');
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const info = await getConnector(id);
        if (info.connected) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2000);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Authorization timed out — please try again.'));
    }, 180000);
  });
}

export class ConnectorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ConnectorApiError';
  }
}

export async function disconnectSource(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}/disconnect`, {
    method: 'POST',
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ConnectorApiError(
      err.detail || `Failed to disconnect ${id}: ${res.status}`,
      res.status,
    );
  }
}

export interface DisconnectUntilCompleteOptions {
  signal?: AbortSignal;
  retryDelayMs?: number;
  onPending?: (message: string) => void;
}

function waitForDisconnectRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Disconnect cancelled', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Disconnect cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

/**
 * Finish a disconnect even when the backend first returns 409 while an active
 * sync is stopping. The server deliberately keeps credentials and indexed
 * data intact until that worker exits; retrying is what completes cleanup.
 */
export async function disconnectSourceUntilComplete(
  id: string,
  {
    signal,
    retryDelayMs = 1500,
    onPending,
  }: DisconnectUntilCompleteOptions = {},
): Promise<void> {
  while (true) {
    try {
      await disconnectSource(id, signal);
      return;
    } catch (err) {
      if (!(err instanceof ConnectorApiError) || err.status !== 409) {
        throw err;
      }
      onPending?.(err.message);
      await waitForDisconnectRetry(retryDelayMs, signal);
    }
  }
}

export async function getSyncStatus(id: string): Promise<SyncStatus> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}/sync`);
  if (!res.ok) throw new Error(`Failed to get sync status for ${id}: ${res.status}`);
  return res.json();
}

export async function triggerSync(id: string): Promise<{ connector_id: string; chunks_indexed: number; status: string }> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Sync failed: ${res.status}`);
  }
  return res.json();
}

/** A saved feed, with what the last sync learned: how many items it had, or what went wrong. */
export interface RssFeed { name: string; url: string; items?: number; error?: string; checked?: string }

export async function getRssFeeds(): Promise<RssFeed[]> {
  const res = await apiFetch('/v1/connectors/news_rss/feeds');
  if (!res.ok) throw new Error(`Failed to load the feeds: ${res.status}`);
  return (await res.json()).feeds;
}

/** Save the whole list; the server checks every address and returns the list it kept. */
export async function saveRssFeeds(feeds: RssFeed[]): Promise<RssFeed[]> {
  const res = await apiFetch('/v1/connectors/news_rss/feeds', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Could not save the feeds: ${res.status}`);
  }
  return (await res.json()).feeds;
}

/** One Google Calendar event, as the Calendar widget needs it. `date` and `end_date` are the first and last day. */
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  end_date: string;
  all_day: boolean;
  time: string; // HH:MM, empty for an all-day event
  url: string;
}

/** The events of the connected Google Calendar from day *from* to day *to* (YYYY-MM-DD). `error` says what went wrong, in words. */
export async function fetchCalendarEvents(from: string, to: string): Promise<{ events: CalendarEvent[]; error?: string }> {
  const res = await apiFetch(`/v1/connectors/gcalendar/events?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`Could not read the calendar: ${res.status}`);
  return res.json();
}

export type Level = 'read' | 'write' | 'all';
/** What Phibe may do with a source: its level, and what the levels above Read add (empty: the source is only read). */
export interface Permission {
  level: Level;
  actions: { write?: string[]; all?: string[] };
  /** Google sources only: what Google lets the saved token do, against what the level needs. `granted` is null when unknown. */
  google?: { expected: string[]; granted: string[] | null; needs_authorization: boolean };
}
export interface ConnectorAction { at: number; action: string; needed: Level; level: Level; allowed: boolean; detail: string }

export async function getPermissions(): Promise<Record<string, Permission>> {
  const res = await apiFetch('/v1/connectors/permissions');
  if (!res.ok) throw new Error(`Could not read the permissions: ${res.status}`);
  return res.json();
}

export async function setPermission(id: string, level: Level): Promise<Level> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Could not save the permission: ${res.status}`);
  }
  return (await res.json()).level;
}

/** The latest changes Phibe tried to make in a source, allowed or blocked. */
export async function getConnectorActions(id: string): Promise<ConnectorAction[]> {
  const res = await apiFetch(`/v1/connectors/${encodeURIComponent(id)}/actions`);
  if (!res.ok) throw new Error(`Could not read the actions: ${res.status}`);
  return (await res.json()).actions;
}
