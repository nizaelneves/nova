import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ConversationList } from './ConversationList';
import { Icon, type IconName } from '../Icon';
import { useAppStore } from '../../lib/store';

interface Module {
  path: string;
  icon: IconName;
  label: string;
}

/** The main menu, in this order. Names are always English. */
const MODULES: Module[] = [
  { path: '/', icon: 'chat-round-dots', label: 'Chat' },
  { path: '/tasks', icon: 'checklist-minimalistic', label: 'Tasks' },
  { path: '/finances', icon: 'wallet', label: 'Finances' },
  { path: '/data-sources', icon: 'database', label: 'Data Sources' },
  { path: '/agents', icon: 'bot', label: 'Agents' },
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
      {active && !expanded && <span aria-hidden="true" className="rail-bar" />}
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
  const [searchQuery, setSearchQuery] = useState('');

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
        {/* Show / hide the names and the chat history */}
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

        <nav className={`flex flex-col gap-2 ${expanded ? '' : 'mt-14 items-center'}`}>
          {MODULES.map((m) => (
            <div key={m.path} className={m.path === '/settings' ? 'mt-3' : undefined}>
              <RailItem
                module={m}
                active={isActive(m.path)}
                expanded={expanded}
                onClick={() => navigate(m.path)}
              />
            </div>
          ))}
        </nav>

        {expanded && (
          <div
            className="flex-1 min-h-0 flex flex-col mt-4 pt-4"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <div className="mb-2 px-1">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm"
                style={{ background: 'var(--color-glass)', border: '1px solid var(--color-border)' }}
              >
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--color-text)' }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList searchQuery={searchQuery} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
