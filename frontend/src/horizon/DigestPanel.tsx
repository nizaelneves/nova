import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { apiFetch } from '../lib/api';
import { SidePanel } from './SidePanel';
import { initials, parseDigest, timeLabel, type Digest, type RawDigest } from './lib/digest';

type Load = { kind: 'loading' } | { kind: 'empty' } | { kind: 'error'; message: string } | { kind: 'ready'; digest: Digest };

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
 * The quick digest: an agent of Phibe reads your news, newsletters and the latest notes of your data sources and
 * writes the main points here (the server keeps the last one).
 */
export function DigestPanel({ open }: { open: boolean }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [tab, setTab] = useState<'highlights' | 'sources'>('highlights');
  const [writing, setWriting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    void fetchDigest().then(setLoad);
  }, [open]);

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
  return (
    <SidePanel open={open} label="Quick Digest">
      {digest && !writing && (
        <div className="dg-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'highlights'} data-on={tab === 'highlights'} onClick={() => setTab('highlights')}><Icon name="stars" size={15} />Highlights <em>{digest.items.length}</em></button>
          <button type="button" role="tab" aria-selected={tab === 'sources'} data-on={tab === 'sources'} onClick={() => setTab('sources')}><Icon name="database" size={15} />Sources <em>{digest.sources.length}</em></button>
        </div>
      )}

      {writing && <div className="dg-state"><i className="dl-spin" aria-hidden="true" />Writing your digest…</div>}
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
          <div className="isl-tiles">
            <div><b>{digest.count}</b><span>Items</span></div>
            <div><b>{digest.sources.length}</b><span>Sources</span></div>
          </div>

          {tab === 'highlights' ? (
            digest.items.length ? (
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
            ) : <p className="dg-none">Nothing to highlight yet.</p>
          ) : (
            <ul className="dg-sources">
              {digest.sources.length ? digest.sources.map((s) => <li key={s}><i />{s}</li>) : <li className="dg-none">No sources were used.</li>}
            </ul>
          )}

          <footer className="dg-foot">
            <span>{digest.model || 'Phibe'} · {timeLabel(digest.generatedAt, now)}</span>
            <button type="button" onClick={() => void write()}><Icon name="refresh" size={14} /> Refresh</button>
          </footer>
        </>
      )}
    </SidePanel>
  );
}
