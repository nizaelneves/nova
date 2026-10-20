import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../components/Icon';
import { CalendarPanel } from './CalendarPanel';
import { ComputerPanel } from './ComputerPanel';
import { DigestPanel } from './DigestPanel';

type Panel = 'digest' | 'calendar' | 'system';
const BUTTONS: { id: Panel; label: string; icon: IconName }[] = [
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'digest', label: 'Quick Digest', icon: 'newspaper' },
  { id: 'system', label: 'System', icon: 'cpu' },
];

/**
 * The home screen's side screens: two buttons at the top right, level with the menu button on the left. Each one
 * opens its own screen from top to bottom (a mini calendar, the quick digest) and closes it again. They start
 * closed every time and can be open together.
 */
export function Horizon() {
  const [open, setOpen] = useState<Panel[]>([]);
  const column = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const toggle = (id: Panel) => setOpen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  useEffect(() => {
    if (!open.length) return undefined;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!column.current?.contains(t) && !dock.current?.contains(t)) setOpen([]);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setOpen([]); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', onKey); };
  }, [open.length]);

  return createPortal(
    <>
      <div className="hz-dock" ref={dock}>
        {BUTTONS.map((b) => (
          <button key={b.id} type="button" className="rail-item w-11 justify-center cursor-pointer" data-active={open.includes(b.id)} aria-label={b.label} aria-expanded={open.includes(b.id)} onClick={() => toggle(b.id)}>
            <Icon name={b.icon} size={20} className="rail-icon" />
          </button>
        ))}
      </div>
      <div className="dg-column" ref={column}>
        <CalendarPanel open={open.includes('calendar')} />
        <DigestPanel open={open.includes('digest')} />
        <ComputerPanel open={open.includes('system')} />
      </div>
    </>,
    document.body,
  );
}
