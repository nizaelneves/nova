import { useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon, type IconName } from '../Icon';
import { useAppStore } from '../../lib/store';
import { FX_WIDTH, useRailSurge } from '../../lib/railSurge';

interface Module {
  path: string;
  icon: IconName;
  label: string;
}

/** The main menu, in this order. Names are always English. */
const MODULES: Module[] = [
  { path: '/', icon: 'chat-round-dots', label: 'Chat' },
  { path: '/desk', icon: 'desk', label: 'Your Desk' },
  { path: '/seeds', icon: 'sunflower', label: 'Seeds' },
  { path: '/finances', icon: 'wallet', label: 'Finances' },
  { path: '/tutor', icon: 'graduation-cap', label: 'Tutor Mod' },
  { path: '/approvals', icon: 'shield-check', label: 'Approvals' },
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
      onClick={onClick}
      data-active={active}
      aria-label={module.label}
      aria-current={active ? 'page' : undefined}
      className={`rail-item cursor-pointer ${expanded ? 'w-full px-3' : 'w-11 justify-center'}`}
    >
      <Icon name={module.icon} size={22} className="rail-icon shrink-0" />
      {expanded && <span className="text-sm font-normal truncate">{module.label}</span>}
      {/* Names appear as a tip only while the menu is collapsed to icons. */}
      {!expanded && <span className="rail-tip">{module.label}</span>}
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const expanded = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const messages = useAppStore((s) => s.messages);

  const handleNewChat = () => {
    // Don't create a new chat if the current one is empty
    if (messages.length > 0) createConversation(selectedModel);
    navigate('/');
  };

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
          {expanded && (
            <button
              type="button"
              onClick={handleNewChat}
              className="rail-item px-3 gap-2 cursor-pointer text-sm"
              aria-label="New chat"
            >
              <Icon name="add-circle" size={20} className="rail-icon" />
              <span className="font-normal">New chat</span>
            </button>
          )}
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
