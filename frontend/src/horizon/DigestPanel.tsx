import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { TerminalLine } from '../components/TerminalLine';
import { apiFetch } from '../lib/api';
import { DigestFeed } from './DigestFeed';
import { DigestReader } from './DigestReader';
import { SidePanel } from './SidePanel';
import { initials, kindCounts, kindLabel, parseDigest, timeLabel, type BlockKind, type Digest, type RawDigest } from './lib/digest';

type Load = { kind: 'loading' } | { kind: 'empty' } | { kind: 'error'; message: string } | { kind: 'ready'; digest: Digest };

const KIND_ICON: Record<BlockKind, IconName> = { news: 'newspaper', rss: 'feed', mail: 'mail', other: 'layers' };

/** Reads the last digest. A 404 only means none has been written yet. */
async function fetchDigest(): Promise<Load> {
  try {
    const res = await apiFetch('/api/quick-digest');
    if (res.status === 404) return { kind: 'empty' };
    if (!res.ok) return { kind: 'error', message: `The digest is not available (${res.status}).` };
    return { kind: 'ready', digest: parseDigest((await res.json()) as RawDigest) };
  } catch {
    return { kind: 'error', message: 'The Phibe backend is not answering.' };
  }
}

/**
 * The quick digest: an agent of Phibe reads your news, newsletters and the latest items of your sources and keeps them
 * as small blocks that slide by on their own. A button opens all of them in a large window to read quickly.
 */
export function DigestPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [filter, setFilter] = useState<BlockKind | 'all'>('all');
  const [reader, setReader] = useState<{ start: string | null } | null>(null);
  const [writing, setWriting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    void fetchDigest().then(setLoad);
    // Each source is read again on its own rhythm by the server; show what it kept while the widget is open.
    const every = window.setInterval(() => { setNow(new Date()); void fetchDigest().then((next) => setLoad((cur) => (next.kind === 'ready' || cur.kind !== 'ready' ? next : cur))); }, 60_000);
    return () => window.clearInterval(every);
  }, [open]);

  /** The reader replaces the widget: the widget folds away and the large window opens. */
  const openReader = (start: string | null) => { setReader({ start }); onClose(); };

  const write = useCallback(async () => {
    setWriting(true);
    try {
      const res = await apiFetch('/api/quick-digest/generate', { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().then((j) => String(j.detail ?? ''), () => '');
        setLoad({ kind: 'error', message: detail || `Could not write the digest (${res.status}).` });
      } else {
        setNow(new Date());
        setLoad(await fetchDigest());
      }
    } catch {
      setLoad({ kind: 'error', message: 'The Phibe backend is not answering.' });
    } finally {
      setWriting(false);
    }
  }, []);

  const digest = load.kind === 'ready' ? load.digest : null;
  const blocks = digest ? digest.blocks.filter((b) => filter === 'all' || b.kind === filter) : [];
  return (
    <>
      <SidePanel open={open} label="Pulse">
        {writing && <div className="dg-state"><i className="dl-spin" aria-hidden="true" />Writing Your Digest…</div>}
        {!writing && load.kind === 'loading' && <div className="dg-state"><i className="dl-spin" aria-hidden="true" />Loading…</div>}

        {!writing && load.kind === 'empty' && (
          <div className="dg-state dg-empty">
            <p>No digest yet today.</p>
            <button type="button" className="pj-add" onClick={() => void write()}><Icon name="stars" size={16} /> Write Digest</button>
          </div>
        )}

        {!writing && load.kind === 'error' && (
          <div className="dg-state dg-empty">
            <p style={{ color: 'var(--color-error)' }}>{load.message}</p>
            <button type="button" className="pj-add" onClick={() => void write()}>Try Again</button>
          </div>
        )}

        {!writing && digest && (
          <>
            <TerminalLine text={digest.blocks.length ? `${digest.blocks.length} new ${digest.blocks.length === 1 ? 'item' : 'items'} from ${new Set(digest.blocks.map((b) => b.source)).size} ${new Set(digest.blocks.map((b) => b.source)).size === 1 ? 'source' : 'sources'}` : digest.headline} />

            {digest.blocks.length > 0 ? (
              <>
                <div className="fin-actions dg-chips" role="tablist" aria-label="Kinds">
                  <button type="button" role="tab" aria-selected={filter === 'all'} data-active={filter === 'all'} className="fin-act" aria-label="All" title="All" onClick={() => setFilter('all')}>
                    <Icon name="widget-2" size={16} /><span>All</span>
                  </button>
                  {kindCounts(digest.blocks).map((k) => (
                    <button key={k.kind} type="button" role="tab" aria-selected={filter === k.kind} data-active={filter === k.kind} className="fin-act" aria-label={kindLabel[k.kind]} title={`${kindLabel[k.kind]} (${k.count})`} onClick={() => setFilter(k.kind)}>
                      <Icon name={KIND_ICON[k.kind]} size={16} /><span>{kindLabel[k.kind]}</span>
                    </button>
                  ))}
                </div>
                <DigestFeed blocks={blocks} now={now} onOpen={(b) => openReader(b.id)} />
              </>
            ) : digest.items.length ? (
              <ol className="dg-list">
                {digest.items.map((item) => (
                  <li key={item.id}>
                    <span className="dg-av">{initials(item.title)}</span>
                    <div>
                      <b>{item.title}<time>{timeLabel(digest.generatedAt, now)}</time></b>
                      <p>{item.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="dg-none">Nothing to highlight yet.</p>}

            <footer className="dg-foot">
              <span>{digest.model || 'Phibe'} · {timeLabel(digest.generatedAt, now)}</span>
              <span className="dg-acts">
                {digest.blocks.length > 0 && <button type="button" onClick={() => openReader(null)}><Icon name="widget-2" size={14} /> Open</button>}
                <button type="button" onClick={() => void write()}><Icon name="refresh" size={14} /> Refresh</button>
              </span>
            </footer>
          </>
        )}
      </SidePanel>
      {reader && digest && <DigestReader digest={digest} now={now} start={reader.start} onClose={() => setReader(null)} />}
    </>
  );
}
