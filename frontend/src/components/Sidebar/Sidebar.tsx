import { useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon, type IconName } from '../Icon';
import { useAppStore } from '../../lib/store';
import { FX_WIDTH, useRailSurge } from '../../lib/railSurge';

interface Module {
  path: string;
  icon: IconName;
  label: string;
  /** Shown in the menu but not open yet. */
  soon?: boolean;
}

/** The main menu, in this order. Names are always English. */
const MODULES: Module[] = [
  { path: '/', icon: 'galaxy', label: 'Horizon' },
  { path: '/workspaces', icon: 'widget-2', label: 'Workspaces' },
  { path: '/tasks', icon: 'checklist-minimalistic', label: 'Tasks' },
  { path: '/pings', icon: 'bell', label: 'Pings' },
  { path: '/meeting-notes', icon: 'transcript', label: 'Meeting Minutes' },
  { path: '/seeds', icon: 'north-star', label: 'Atlas' },
  { path: '/finances', icon: 'wallet', label: 'Finances' },
  { path: '/tutor', icon: 'horus-eye', label: 'Mentor Mode', soon: true },
  { path: '/settings', icon: 'settings', label: 'Settings' },
];

function RailItem({
  module,
  active,
  expanded,
  onClick,
}: {
  module: Module;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={module.soon ? undefined : onClick}
      data-active={active}
      aria-label={module.label}
      aria-current={active ? 'page' : undefined}
      aria-disabled={module.soon || undefined}
      className={`rail-item ${module.soon ? 'cursor-default' : 'cursor-pointer'} ${expanded ? 'w-full px-3' : 'w-11 justify-center'}`}
      style={module.soon ? { opacity: 0.4 } : undefined}
    >
      <Icon name={module.icon} size={22} className="rail-icon shrink-0" />
      {expanded && <span className="text-sm font-normal truncate">{module.label}{module.soon && <em className="rail-soon">Coming Soon</em>}</span>}
      {/* Names appear as a tip only while the menu is collapsed to icons. */}
      {!expanded && <span className="rail-tip">{module.soon ? `${module.label} · Coming Soon` : module.label}</span>}
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const expanded = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const navRef = useRef<HTMLElement>(null);
  const surgeRef = useRef<HTMLSpanElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const activePath = MODULES.find((m) => isActive(m.path))?.path ?? null;
  useRailSurge(navRef, surgeRef, fxRef, activePath, expanded);

  return (
    <aside
      className={`
        fixed md:relative z-30 flex flex-col h-full shrink-0
        transition-[width] duration-300 ease-[var(--ease-out)]
        ${expanded ? 'w-[260px] overflow-hidden' : 'w-[72px]'}
      `}
      style={{
        background: expanded ? 'var(--color-sidebar)' : 'transparent',
        backdropFilter: expanded ? 'blur(20px)' : undefined,
        WebkitBackdropFilter: expanded ? 'blur(20px)' : undefined,
        borderRight: expanded ? '1px solid var(--color-border)' : '1px solid transparent',
      }}
    >
      <div className={`flex flex-col h-full ${expanded ? 'w-[260px] px-3' : 'w-[72px] items-center'}`}>
        {/* Show / hide the names */}
        <div className={`pt-5 pb-3 flex items-center ${expanded ? 'justify-between' : 'justify-center'}`}>
          <button
            type="button"
            onClick={toggleSidebar}
            className="rail-item w-11 justify-center cursor-pointer"
            aria-label={expanded ? 'Hide menu names' : 'Show menu names'}
          >
            <Icon name="sidebar-minimalistic" size={20} className="rail-icon" />
            {!expanded && <span className="rail-tip">Expand menu</span>}
          </button>
        </div>

        <nav ref={navRef} className={`relative flex flex-col gap-2 [@media(max-height:720px)]:gap-1 ${expanded ? '' : 'mt-14 [@media(max-height:720px)]:mt-8 items-center'}`}>
          <canvas ref={fxRef} aria-hidden="true" className="rail-fx" style={{ width: FX_WIDTH }} />
          <span ref={surgeRef} aria-hidden="true" className="rail-surge" />
          {MODULES.map((m) => (
            <div key={m.path} data-rail-path={m.path} className={m.path === '/settings' ? 'mt-3' : undefined}>
              <RailItem
                module={m}
                active={isActive(m.path)}
                expanded={expanded}
                onClick={() => navigate(m.path)}
              />
            </div>
          ))}
        </nav>

      </div>
    </aside>
  );
}
