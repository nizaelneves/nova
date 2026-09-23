import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  MessageCircleMore,
  LayoutDashboard,
  Database,
  Bot,
  ScrollText,
  Settings,
  Rocket,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Monitor,
  Search,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { ApprovalBell } from '../ApprovalBell';
import { ConversationList } from './ConversationList';
import { useAppStore } from '../../lib/store';

interface RailItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

const ITEMS: RailItem[] = [
  { path: '/', icon: MessageCircleMore, label: 'Chat' },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/data-sources', icon: Database, label: 'Data Sources' },
  { path: '/agents', icon: Bot, label: 'Agents' },
  { path: '/logs', icon: ScrollText, label: 'Logs' },
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/get-started', icon: Rocket, label: 'Get Started' },
];

const BUTTON = 34; // px, collapsed button size
const ICON = 20;

/**
 * Left navigation sidebar. Expanded shows icon + label rows with a small
 * toolbar (collapse, theme, pending agent approvals); collapsed falls back
 * to the compact icon-only rail with hover tooltips.
 */
export function NavSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const expanded = useAppStore((s) => s.navExpanded);
  const toggleExpanded = useAppStore((s) => s.toggleNavExpanded);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const messages = useAppStore((s) => s.messages);

  const ThemeIcon = settings.theme === 'light' ? Sun : settings.theme === 'dark' ? Moon : Monitor;
  const nextTheme = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light';
  const onChat = location.pathname === '/';

  const handleNewChat = () => {
    // Don't create a new chat if the current one is already empty.
    if (messages.length === 0) {
      navigate('/');
      return;
    }
    createConversation(selectedModel);
    navigate('/');
  };

  return (
    <nav
      aria-label="Principal"
      className="jarvis-icon-rail relative z-40 flex h-full min-h-0 shrink-0 flex-col"
      style={{
        width: expanded ? 232 : 72,
        transition: 'width 150ms ease',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Toolbar: collapse, theme, pending agent approvals */}
      <div
        className={expanded ? 'flex items-center justify-between px-3 mt-4 mb-2' : 'flex flex-col items-center gap-1 mt-4 mb-2'}
      >
        <button
          type="button"
          onClick={toggleExpanded}
          title={expanded ? 'Recolher menu' : 'Expandir menu'}
          className="p-1.5 rounded-lg cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {expanded ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>
        <button
          type="button"
          onClick={() => updateSettings({ theme: nextTheme })}
          title={`Tema: ${settings.theme} (clique para ${nextTheme})`}
          className="p-1.5 rounded-lg cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <ThemeIcon size={16} />
        </button>
        <ApprovalBell />
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', margin: expanded ? '0 12px 8px' : '0 auto 8px', width: expanded ? undefined : 34 }} />

      {/* Nav items */}
      <ul
        className={
          expanded
            ? 'm-0 flex shrink-0 list-none flex-col gap-0.5 px-2 p-0'
            : 'm-0 flex flex-1 list-none flex-col items-center gap-2 p-0 overflow-y-auto'
        }
      >
        {ITEMS.map((item, i) => {
          const active = location.pathname === item.path;
          const isHovered = hovered === i;
          const Icon = item.icon;

          if (expanded) {
            return (
              <li key={item.path}>
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(item.path)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors text-left"
                  style={{
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    background: active ? 'var(--color-accent-subtle)' : 'transparent',
                    fontWeight: active ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={item.path} className="relative" style={{ height: BUTTON, width: BUTTON }}>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute rounded-full"
                  style={{
                    left: -15,
                    top: 10,
                    width: 2,
                    height: 14,
                    background: 'color-mix(in srgb, var(--color-accent) 70%, transparent)',
                    boxShadow: '0 0 8px color-mix(in srgb, var(--color-accent) 30%, transparent)',
                  }}
                />
              )}
              <button
                type="button"
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.path)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                className="flex items-center justify-center rounded-lg outline-none cursor-pointer focus-visible:ring-2"
                style={{ width: BUTTON, height: BUTTON, color: 'var(--color-text)', background: 'transparent', border: 'none' }}
              >
                <Icon
                  size={ICON}
                  strokeWidth={2.2}
                  style={{
                    opacity: active ? 1 : isHovered ? 0.8 : 0.3,
                    transform: `scale(${isHovered ? 1.14 : 1})`,
                    transition: 'transform 180ms ease, opacity 180ms ease',
                  }}
                />
              </button>
              {isHovered && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute whitespace-nowrap"
                  style={{
                    left: BUTTON + 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                    background: 'color-mix(in srgb, var(--color-text) 8%, transparent)',
                    border: '0.8px solid color-mix(in srgb, var(--color-text) 8%, transparent)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                  }}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Conversation history — only meaningful (and roomy enough) when
          expanded, and only relevant on the Chat page itself. */}
      {expanded && onChat && (
        <>
          <div style={{ borderTop: '1px solid var(--color-border)', margin: '10px 12px 8px' }} />
          <div className="flex items-center gap-1 px-3 mb-2 shrink-0">
            <div
              className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded-lg text-sm min-w-0"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <Search size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              title="New chat"
              className="p-1.5 rounded-lg cursor-pointer transition-colors shrink-0"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <ConversationList searchQuery={searchQuery} />
          </div>
        </>
      )}
    </nav>
  );
}
