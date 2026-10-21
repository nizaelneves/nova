import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import { kindCounts, kindLabel, timeLabel, type BlockKind, type Digest, type DigestBlock } from './lib/digest';

const CLOSE_MS = 300;

type Filter = { kind?: BlockKind };

/**
 * The digest in a large window at the centre of the app: filters on the left, the blocks in a grid, the selected one to
 * read on the right. It opens and closes like the side screens (a flicker, a tint, fine scan lines), under a command
 * line, and it can be driven from the keyboard: arrows or j/k to move, Enter to open the original, Esc to close.
 */
export function DigestReader({ digest, now, start, onClose }: { digest: Digest; now: Date; start: string | null; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>({});
  const [selected, setSelected] = useState<string | null>(start);
  const [closing, setClosing] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => digest.blocks.filter((b) => !filter.kind || b.kind === filter.kind),
    [digest.blocks, filter],
  );
  const current: DigestBlock | undefined = shown.find((b) => b.id === selected) ?? shown[0];
  const sources = useMemo(() => {
    const seen = new Map<string, { name: string; count: number }>();
    for (const b of digest.blocks) seen.set(b.source, { name: b.sourceName, count: (seen.get(b.source)?.count ?? 0) + 1 });
    return [...seen.entries()];
  }, [digest.blocks]);

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const at = Math.max(0, shown.findIndex((b) => b.id === current?.id));
      const go = (to: number) => { e.preventDefault(); setSelected(shown[Math.min(shown.length - 1, Math.max(0, to))]?.id ?? null); };
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') go(at + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') go(at - 1);
      else if (e.key === 'Enter' && current?.url) window.open(current.url, '_blank', 'noopener,noreferrer');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    grid.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current?.id]);

  const kinds = kindCounts(digest.blocks);
  return createPortal(
    <div className="dr-root" role="dialog" aria-label="Digest" data-closing={closing || undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dr" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dr-head">
          <button type="button" className="dr-x" onClick={close} aria-label="Close" title="Close (Esc)"><Icon name="close-circle" size={20} /></button>
        </header>

        <div className="dr-body">
          <nav className="dr-rail" aria-label="Filters">
            <button type="button" data-on={!filter.kind} onClick={() => setFilter({})}>All <em>{digest.blocks.length}</em></button>
            {kinds.map((k) => (
              <button key={k.kind} type="button" data-on={filter.kind === k.kind} onClick={() => setFilter({ kind: k.kind })}>{kindLabel[k.kind]} <em>{k.count}</em></button>
            ))}
          </nav>

          <div className="dr-grid" ref={grid}>
            {shown.length === 0 && <p className="dg-none">Nothing here yet.</p>}
            {shown.map((b) => (
              <button key={b.id} type="button" className="dr-card" data-kind={b.kind} data-current={b.id === current?.id} onClick={() => setSelected(b.id)} onDoubleClick={() => b.url && window.open(b.url, '_blank', 'noopener,noreferrer')}>
                <span className="dg-blk-meta"><i />{b.sourceName}{b.time && <time>{timeLabel(b.time, now)}</time>}</span>
                <b><span>{b.title}</span></b>
                <span className="dr-card-line"><span>{b.summary}</span></span>
              </button>
            ))}
          </div>

          <article className="dr-read">
            {current ? (
              <>
                <span className="dg-blk-meta" data-kind={current.kind}><i />{current.sourceName}{current.time && <time>{timeLabel(current.time, now)}</time>}</span>
                <h3>{current.title}</h3>
                <p>{current.text || current.summary}</p>
                {current.url && (
                  <a className="set-btn" href={current.url} target="_blank" rel="noopener noreferrer"><Icon name="link-round" size={13} /> Open Original</a>
                )}
              </>
            ) : <p className="dg-none">Pick a block to read it.</p>}
          </article>
        </div>

        <footer className="dr-status">
          <span>items {digest.blocks.length}</span><span>sources {sources.length}</span><span>generated {timeLabel(digest.generatedAt, now)}</span>
          <span className="dr-keys">↑↓ move · Enter open · Esc close</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
