import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../Icon';
import type { SeedArea } from './areas';

const RAIL: { icon: IconName; label: string }[] = [
  { icon: 'document-text', label: 'All Notes' },
  { icon: 'star-shine', label: 'Starred' },
  { icon: 'clock-circle', label: 'Recent' },
  { icon: 'tag', label: 'Tags' },
  { icon: 'folder', label: 'Folders' },
];

/**
 * Inside one area of the swipe file: its own world, covering the whole app.
 * Layout only for now: icon rail, list of notes, reader, side panels.
 */
export function AreaSpace({ area, onOrbit, onLeave }: { area: SeedArea; onOrbit: () => void; onLeave: () => void }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [rail, setRail] = useState(0);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOrbit(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onOrbit]);

  return createPortal(
    <div className="seeds-space" style={{ '--area': area.color } as React.CSSProperties}>
      <nav className="seeds-rail" aria-label="Seeds">
        <button type="button" className="seeds-rail-btn seeds-rail-area" onClick={onOrbit} aria-label="Back to the orbit" title="Back to the orbit">
          <Icon name={area.icon} size={20} />
        </button>
        <div className="seeds-rail-list">
          {RAIL.map((r, i) => (
            <button key={r.label} type="button" className="seeds-rail-btn" data-active={rail === i} aria-label={r.label} title={r.label} onClick={() => setRail(i)}>
              <Icon name={r.icon} size={20} />
            </button>
          ))}
        </div>
        <button type="button" className="seeds-rail-btn" onClick={onLeave} aria-label="Back to Phibe" title="Back to Phibe">
          <Icon name="logout-2" size={20} />
        </button>
      </nav>

      <div className="seeds-body">
        <header className="seeds-top">
          <label className="seeds-search">
            <Icon name="magnifer" size={16} />
            <input placeholder={`Search ${area.title}`} aria-label={`Search ${area.title}`} />
          </label>
          <h2>{area.title}</h2>
          <div className="seeds-top-actions">
            <button type="button" className="seeds-new"><Icon name="add-circle" size={16} /> New Note</button>
            <button type="button" className="seeds-leave" onClick={onLeave}>Back to Phibe</button>
          </div>
        </header>

        <div className="seeds-cols">
          <section className="seeds-list" aria-label="Notes">
            <div className="seeds-chips">
              <button type="button" data-active={folder === null} onClick={() => setFolder(null)}>All</button>
              {area.folders.map((f) => (
                <button key={f} type="button" data-active={folder === f} onClick={() => setFolder(f)}>{f}</button>
              ))}
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="seeds-card seeds-skeleton" aria-hidden="true">
                <span className="seeds-bar" style={{ width: '38%' }} />
                <span className="seeds-bar seeds-bar-title" style={{ width: '78%' }} />
                <span className="seeds-bar" style={{ width: '92%' }} />
                <span className="seeds-bar" style={{ width: '60%' }} />
              </div>
            ))}
          </section>

          <section className="seeds-reader" aria-label="Note">
            <div className="seeds-reader-top" aria-hidden="true">
              <span className="seeds-bar" style={{ width: 90 }} />
              <span className="seeds-bar" style={{ width: 120 }} />
            </div>
            <div className="seeds-reader-head" aria-hidden="true">
              <span className="seeds-avatar"><Icon name={area.icon} size={26} /></span>
              <span className="seeds-bar seeds-bar-title" style={{ width: 220 }} />
              <span className="seeds-bar" style={{ width: 150 }} />
            </div>
            <div className="seeds-reader-body" aria-hidden="true">
              {[96, 100, 88, 100, 72, 0, 100, 94, 100, 58].map((w, i) => (
                w ? <span key={i} className="seeds-bar" style={{ width: `${w}%` }} /> : <span key={i} className="seeds-gap" />
              ))}
            </div>
            <div className="seeds-attach" aria-hidden="true">
              <span className="seeds-card seeds-skeleton"><span className="seeds-bar" style={{ width: '70%' }} /><span className="seeds-bar" style={{ width: '40%' }} /></span>
              <span className="seeds-card seeds-skeleton"><span className="seeds-bar" style={{ width: '60%' }} /><span className="seeds-bar" style={{ width: '45%' }} /></span>
            </div>
            <label className="seeds-compose">
              <input placeholder="Start typing a note" aria-label="Start typing a note" />
              <span className="seeds-send"><Icon name="arrow-up" size={16} /></span>
            </label>
          </section>

          <aside className="seeds-panels" aria-label="Panels">
            <section className="seeds-panel">
              <h3><Icon name="folder" size={16} /> Folders</h3>
              <ul>
                {area.folders.map((f) => (
                  <li key={f}><button type="button" onClick={() => setFolder(f)} data-active={folder === f}>{f}<em>0</em></button></li>
                ))}
              </ul>
            </section>
            <section className="seeds-panel">
              <h3><Icon name="link-round" size={16} /> Linked Notes</h3>
              <div className="seeds-skeleton" aria-hidden="true">
                <span className="seeds-bar" style={{ width: '70%' }} />
                <span className="seeds-bar" style={{ width: '50%' }} />
              </div>
            </section>
            <section className="seeds-panel">
              <h3><Icon name="tag" size={16} /> Tags</h3>
              <div className="seeds-skeleton seeds-skeleton-row" aria-hidden="true">
                <span className="seeds-bar" style={{ width: 54 }} />
                <span className="seeds-bar" style={{ width: 72 }} />
                <span className="seeds-bar" style={{ width: 46 }} />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
