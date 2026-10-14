import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import type { SeedArea } from './areas';

/** Degrees per millisecond: one full turn a minute. */
const SPIN = 0.006;

/**
 * The Seeds hub: the areas of the swipe file orbit a glowing core.
 * Positions are written straight to the DOM every frame, so hovering and
 * selecting never re-renders the ring.
 */
export function OrbitHub({ areas, onEnter }: { areas: SeedArea[]; onEnter: (area: SeedArea) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const angle = useRef(0);
  const paused = useRef(false);
  const [active, setActive] = useState<SeedArea | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let radius = 0;
    const measure = () => { radius = Math.min(el.clientWidth, el.clientHeight) * 0.42; };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (!paused.current && !still) angle.current = (angle.current + (now - last) * SPIN) % 360;
      last = now;
      areas.forEach((_, i) => {
        const node = nodes.current[i];
        if (!node) return;
        const a = ((i / areas.length) * 360 + angle.current) * (Math.PI / 180);
        const near = (1 + Math.sin(a)) / 2; // nodes at the bottom are "closer"
        node.style.transform = `translate(${Math.cos(a) * radius}px, ${Math.sin(a) * radius}px)`;
        node.style.opacity = String(0.55 + 0.45 * near);
        node.style.zIndex = String(10 + Math.round(near * 10));
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); resize.disconnect(); };
  }, [areas]);

  const hold = (area: SeedArea | null) => {
    paused.current = area !== null;
    setActive(area);
  };

  return (
    <div className="seeds-stage" ref={stage}>
      <div className="seeds-track" aria-hidden="true" />

      <div className="seeds-core">
        <span className="seeds-pulse" />
        <span className="seeds-pulse seeds-pulse-late" />
        <span className="seeds-orb">
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
            <path className="seeds-orb-spiral" pathLength="1" d="M3 16.1A11.1 11.1 0 0 1 14.1 5A6.9 6.9 0 0 1 21 11.9A4.2 4.2 0 0 1 16.8 16.1A2.7 2.7 0 0 1 14.1 13.4A1.6 1.6 0 0 1 15.7 11.8" />
          </svg>
        </span>
        <div className="seeds-core-text" aria-live="polite">
          {active && <h1>{active.title}</h1>}
        </div>
      </div>

      {areas.map((area, i) => (
        <button
          key={area.id}
          ref={(el) => { nodes.current[i] = el; }}
          type="button"
          className="seeds-node"
          style={{ '--area': area.color } as React.CSSProperties}
          data-active={active?.id === area.id}
          data-related={active?.related.includes(area.id) ?? false}
          aria-label={area.title}
          onMouseEnter={() => hold(area)}
          onMouseLeave={() => hold(null)}
          onFocus={() => hold(area)}
          onBlur={() => hold(null)}
          onClick={() => onEnter(area)}
        >
          <span className="seeds-node-dot"><Icon name={area.icon} size={20} /></span>
          <span className="seeds-node-label">{area.title}</span>
        </button>
      ))}
    </div>
  );
}
