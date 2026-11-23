import { useEffect, useState } from 'react';
import { getRssFeeds, saveRssFeeds, type RssFeed } from '../lib/connectors-api';
import { addressesIn, feedMatches } from '../lib/rssFeeds';
import { Icon } from './Icon';

/**
 * The feeds of a connected RSS source: paste any number of addresses to add them, search the list, remove a
 * feed with its button. Each row says how the last sync went. The list scrolls inside its own box, so it stays
 * the same size with two feeds or a hundred. *reload* changes after a sync, to read the results again.
 */
export function RssFeeds({ reload, onDisconnect }: { reload?: string; onDisconnect: () => void }) {
  const [feeds, setFeeds] = useState<RssFeed[] | null>(null);
  const [paste, setPaste] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getRssFeeds().then(setFeeds).catch(() => setFeeds(null)); }, [reload]);

  const save = async (next: { name: string; url: string }[]): Promise<boolean> => {
    setBusy(true);
    try {
      setFeeds(await saveRssFeeds(next));
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the feeds');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!feeds) return null;
  const wanted = addressesIn(paste);
  const fresh = wanted.filter((url) => !feeds.some((f) => f.url === url));
  const shown = feeds.filter((f) => feedMatches(f, query));
  const failing = feeds.filter((f) => f.error).length;

  const add = async () => {
    if (!fresh.length) { setError('Those feeds are already in the list'); return; }
    if (await save([...feeds, ...fresh.map((url) => ({ name: '', url }))])) setPaste('');
  };

  return (
    <div className="rf">
      <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setError(''); }} rows={2} spellCheck={false}
        aria-label="Addresses to add" placeholder="Paste addresses: a feed, a site or a YouTube channel. Separate them with commas or lines." />
      <div className="rf-add">
        <button type="button" disabled={busy || wanted.length === 0} onClick={() => void add()}>{busy ? 'Checking Feeds' : 'Add Feeds'}</button>
        {error && <p role="alert">{error}</p>}
      </div>

      <div className="rf-head">
        <b>{feeds.length} {feeds.length === 1 ? 'Feed' : 'Feeds'}</b>
        {failing > 0 && <span>{failing} With {failing === 1 ? 'An Error' : 'Errors'}</span>}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search the feeds" />
      </div>
      <ul className="rf-list">
        {shown.map((f) => (
          <li key={f.url}>
            <i data-state={f.error ? 'error' : f.checked ? 'ok' : 'new'} aria-hidden="true" />
            <span className="rf-name"><b>{f.name}</b><em title={f.url} data-error={!!f.error || undefined}>{f.error || f.url}</em></span>
            <small>{f.checked && !f.error ? `${f.items ?? 0} ${f.items === 1 ? 'item' : 'items'}` : ''}</small>
            <button type="button" aria-label={`Remove ${f.name}`} title={feeds.length === 1 ? 'Remove (disconnects RSS)' : 'Remove'}
              disabled={busy} onClick={() => (feeds.length === 1 ? onDisconnect() : void save(feeds.filter((x) => x.url !== f.url)))}>
              <Icon name="trash-bin-2" size={14} />
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="rf-none">No feed matches.</li>}
      </ul>
    </div>
  );
}
