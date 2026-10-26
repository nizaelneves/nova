import { useEffect, useState } from 'react';
import { fromLabel, timeLabel, type DigestBlock } from './lib/digest';

const ROW = 118; // px: the height of one block (the .dg-blk height in index.css), so the track can slide by whole blocks

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One block: the source and when, a headline, one line. */
function Block({ block, now, onOpen }: { block: DigestBlock; now: Date; onOpen: (b: DigestBlock) => void }) {
  return (
    <button type="button" className="dg-blk" data-kind={block.kind} onClick={() => onOpen(block)}>
      <span className="dg-blk-meta"><i /><span className="dg-blk-from" title={fromLabel(block)}>{fromLabel(block)}</span>{block.time && <time>{timeLabel(block.time, now)}</time>}</span>
      <b><span>{block.title}</span></b>
      <span className="dg-blk-line">{block.summary}</span>
    </button>
  );
}

/**
 * The blocks, a few at a time, sliding up by one block every few seconds (it stops while the pointer is on it and when
 * the system asks for less motion, and then it simply scrolls). A block opens in the reader.
 */
export function DigestFeed({ blocks, now, onOpen, visible = 4, every = 6000 }: {
  blocks: DigestBlock[];
  now: Date;
  onOpen: (b: DigestBlock) => void;
  visible?: number;
  every?: number;
}) {
  const [i, setI] = useState(0);
  const [jump, setJump] = useState(false);
  const [paused, setPaused] = useState(false);
  const n = blocks.length;
  const slide = n > visible && !reduced();

  useEffect(() => setI(0), [blocks]);

  useEffect(() => {
    if (!slide || paused) return undefined;
    const t = setInterval(() => setI((x) => x + 1), every);
    return () => clearInterval(t);
  }, [slide, paused, every]);

  // Past the last block the track shows the first ones again (they are repeated at its end); then it jumps back unseen.
  useEffect(() => {
    if (!slide || i < n) return undefined;
    const t = setTimeout(() => {
      setJump(true);
      setI(0);
      requestAnimationFrame(() => requestAnimationFrame(() => setJump(false)));
    }, 480);
    return () => clearTimeout(t);
  }, [i, n, slide]);

  if (!n) return <p className="dg-none">Nothing here yet.</p>;
  const rows = slide ? [...blocks, ...blocks.slice(0, visible)] : blocks;
  return (
    <div className="dg-feed" data-slide={slide || undefined} style={{ height: Math.min(n, visible) * ROW }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="dg-track" style={slide ? { transform: `translateY(${-i * ROW}px)`, transition: jump ? 'none' : 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)' } : undefined}>
        {rows.map((b, k) => <Block key={`${b.id}-${k}`} block={b} now={now} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
