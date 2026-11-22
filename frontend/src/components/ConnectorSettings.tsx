import { useEffect, useState } from 'react';
import { choiceLabel, choicesWith, DAILY, hasOwn, minutesOf, timeOf, withChoice, withDefault, withTime } from '../lib/syncRhythm';
import { getConnectorActions, type ConnectorAction, type Level, type Permission } from '../lib/connectors-api';
import type { SyncSettings } from '../lib/api';
import { Popup } from './Popup';
import { RssFeeds } from './RssFeeds';

export const LEVEL_LABEL: Record<Level, string> = { read: 'Read Only', write: 'Can Write', all: 'Full Access' };

const ago = (at: number) => new Date(at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Everything Phibe may do at a level, and what is still locked. */
function allowedAndBlocked(level: Level, actions: Permission['actions']) {
  const write = actions.write ?? [];
  const all = actions.all ?? [];
  return {
    allowed: ['Read and index what it can see', ...(level !== 'read' ? write : []), ...(level === 'all' ? all : [])],
    blocked: [...(level === 'read' ? write : []), ...(level !== 'all' ? all : [])],
  };
}

/** Whether Google itself agrees with the level: its permission is what really stops a change, whatever Phibe does. */
function GoogleAccess({ level, access, authorizing, onAuthorize }: {
  level: Level;
  access: NonNullable<Permission['google']>;
  authorizing: boolean;
  onAuthorize: () => void;
}) {
  if (!access.needs_authorization) {
    return access.granted ? <p className="cs-google" data-ok>Google access matches {LEVEL_LABEL[level]}.</p> : null;
  }
  const broader = (access.granted ?? []).some((s) => !access.expected.includes(s));
  return (
    <div className="cs-google">
      <p>{broader ? `Google still gives Phibe more access than ${LEVEL_LABEL[level]}. Authorize again to narrow it.` : `Google has to allow ${LEVEL_LABEL[level]}. Authorize to continue.`}</p>
      <button type="button" className="fin-btn-quiet" disabled={authorizing} onClick={onAuthorize}>{authorizing ? 'Waiting For Google…' : 'Authorize With Google'}</button>
    </div>
  );
}

/**
 * The settings of one connected source: what Phibe may do with it, how often it updates, and what it did lately.
 * Opened from the gear of the source's card.
 */
export function ConnectorSettings({ id, name, permission, onLevel, onAuthorize, authorizing, sync, onChangeSync, statusLine, syncing, onSyncNow, onDisconnect, onClose }: {
  id: string;
  name: string;
  permission: Permission;
  onLevel: (level: Level) => Promise<boolean>;
  onAuthorize: () => void;
  authorizing: boolean;
  sync: SyncSettings | null;
  onChangeSync: (changes: Partial<SyncSettings>) => Promise<void>;
  statusLine: string;
  syncing: boolean;
  onSyncNow: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [actions, setActions] = useState<ConnectorAction[]>([]);
  const canWrite = (permission.actions.write?.length ?? 0) + (permission.actions.all?.length ?? 0) > 0;
  const levels: Level[] = ['read', ...((permission.actions.write?.length ? ['write'] : []) as Level[]), ...((permission.actions.all?.length ? ['all'] : []) as Level[])];
  const { allowed, blocked } = allowedAndBlocked(permission.level, permission.actions);

  useEffect(() => { if (canWrite) getConnectorActions(id).then(setActions).catch(() => setActions([])); }, [id, canWrite, permission.level]);

  const pick = (level: Level) => {
    if (level === permission.level) return;
    if (level === 'all') setConfirming(true);
    else void onLevel(level);
  };

  return (
    <Popup title={`${name} Settings`} hideTitle topGap={0} onClose={onClose} wide>
      <div className="cs">
        <section>
          <h5>Permissions</h5>
          {canWrite ? (
            <>
              <div className="fin-seg" role="tablist" aria-label="What Phibe may do">
                {levels.map((l) => (
                  <button key={l} type="button" role="tab" aria-selected={permission.level === l} data-active={permission.level === l} onClick={() => pick(l)}>{LEVEL_LABEL[l]}</button>
                ))}
              </div>
              {confirming && (
                <div className="cs-warn" role="alert">
                  <p>Full Access lets Phibe delete in {name}, including anything an AI decides on its own. Allow it?</p>
                  <div>
                    <button type="button" className="fin-btn-quiet" onClick={() => setConfirming(false)}>Cancel</button>
                    <button type="button" className="fin-btn danger" onClick={async () => { if (await onLevel('all')) setConfirming(false); }}>Allow Full Access</button>
                  </div>
                </div>
              )}
              <ul className="cs-can">
                {allowed.map((a) => <li key={a} data-ok>{a}</li>)}
                {blocked.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </>
          ) : (
            <p className="fin-hint">Phibe only reads this source. There is nothing to allow or lock.</p>
          )}
          {permission.google && <GoogleAccess level={permission.level} access={permission.google} authorizing={authorizing} onAuthorize={onAuthorize} />}
        </section>

        <section>
          <h5>Update</h5>
          {sync && (
            <div className="cs-row">
              <select
                aria-label="How often"
                value={hasOwn(sync, id) ? minutesOf(sync, id) : 'default'}
                onChange={(e) => void onChangeSync(e.target.value === 'default' ? withDefault(sync, id) : withChoice(sync, id, parseInt(e.target.value, 10)))}
              >
                <option value="default">Default</option>
                {choicesWith(minutesOf(sync, id)).map((m) => <option key={m} value={m}>{choiceLabel(m)}</option>)}
              </select>
              {hasOwn(sync, id) && minutesOf(sync, id) === DAILY && (
                <input type="time" aria-label="Time of day" value={timeOf(sync, id)} onChange={(e) => { if (e.target.value) void onChangeSync(withTime(sync, id, e.target.value)); }} />
              )}
            </div>
          )}
          <div className="cs-row">
            <span className="cs-status">{statusLine}</span>
            <button type="button" className="fin-btn-quiet" disabled={syncing} onClick={onSyncNow}>{syncing ? 'Syncing…' : 'Sync Now'}</button>
          </div>
        </section>

        {id === 'news_rss' && (
          <section>
            <h5>Feeds</h5>
            <RssFeeds reload={statusLine} onDisconnect={onDisconnect} />
          </section>
        )}

        {canWrite && (
          <section>
            <h5>Recent Changes By Phibe</h5>
            {actions.length === 0 ? <p className="fin-hint">Nothing yet.</p> : (
              <ul className="cs-log">
                {actions.slice(0, 5).map((a) => (
                  <li key={`${a.at}-${a.action}-${a.detail}`} data-blocked={!a.allowed || undefined}>
                    <b>{a.action.replace(/_/g, ' ')}</b><span>{a.allowed ? 'Done' : 'Blocked'}</span><time>{ago(a.at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="cs-end">
          <button type="button" className="fin-btn-quiet" onClick={onDisconnect}>Disconnect {name}</button>
        </section>
      </div>
    </Popup>
  );
}
