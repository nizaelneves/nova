import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../components/Icon';
import { CalendarPanel } from './CalendarPanel';
import { ComputerPanel } from './ComputerPanel';
import { DigestPanel } from './DigestPanel';
import { InlinePanels } from './SidePanel';

type Panel = 'calendar' | 'digest' | 'system';
/** Always in alphabetical order, whatever gets added later. */
const TABS: { id: Panel; label: string; icon: IconName }[] = ([
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'digest', label: 'Pulse', icon: 'beat' },
  { id: 'system', label: 'System', icon: 'cpu' },
] as { id: Panel; label: string; icon: IconName }[]).sort((x, y) => x.label.localeCompare(y.label));
const CLOSE_MS = 320;

/**
 * The home screen's widgets in one place: a single button at the top right opens a window in the middle of the
 * screen, with a tab for each widget (Calendar, Pulse, System). The window appears and leaves as a hologram
 * (a flicker, a tint and fine scan lines). It starts closed every time and remembers nothing between openings.
 */
export function Horizon() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // stays true while the window folds away
  const [tab, setTab] = useState<Panel>('calendar');

  useEffect(() => {
    if (open) { setShown(true); return undefined; }
    const t = window.setTimeout(() => setShown(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const index = TABS.findIndex((t) => t.id === tab);
  return createPortal(
    <>
      <div className="hz-dock">
        <button type="button" className="rail-item w-11 justify-center cursor-pointer" data-active={open} aria-label="Widgets" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="stars" size={20} className="rail-icon" />
          <span className="hz-tip" aria-hidden="true">Widgets</span>
        </button>
      </div>

      {/* Always in the tree (hidden when shut) so the digest reader it owns survives the window closing. */}
      <div className="hzw-root" hidden={!shown} data-open={open} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <section className="hzw" role="region" aria-label="Widgets">
          <i className="hzw-edge" aria-hidden="true" />
          <header className="hzw-head">
            <nav className="hzw-tabs" role="tablist" aria-label="Widgets" style={{ ['--i' as string]: index }}>
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id} onClick={() => setTab(t.id)}>
                  <Icon name={t.icon} size={16} />
                  <span>{t.label}</span>
                </button>
              ))}
              <u aria-hidden="true" />
            </nav>
            <button type="button" className="hzw-x" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close-circle" size={20} /></button>
          </header>
          <div className="hzw-body" role="tabpanel">
            <InlinePanels.Provider value>
              <CalendarPanel open={open && tab === 'calendar'} />
              <DigestPanel open={open && tab === 'digest'} onClose={() => setOpen(false)} />
              <ComputerPanel open={open && tab === 'system'} />
            </InlinePanels.Provider>
          </div>
        </section>
      </div>
    </>,
    document.body,
  );
}
