import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Sidebar } from './Sidebar/Sidebar';
import { Galaxy } from './Galaxy';
import { Island } from './Island';
import { PhibeBubble } from './PhibeBubble';
import { VoiceOverlay } from './VoiceOverlay';
import { useAppStore } from '../lib/store';
import { checkHealth, isTauri } from '../lib/api';
import { useVoiceDelivery } from '../hooks/useVoiceDelivery';

export function Layout() {
  useVoiceDelivery();
  const menuOpen = useAppStore((s) => s.sidebarOpen);
  useEffect(() => {
    if (!isTauri()) return;
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke('voice_set_sidebar', { width: menuOpen ? 260 : 72 }));
  }, [menuOpen]);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => checkHealth().then(setApiReachable);
    check();
    const interval = setInterval(check, 30000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const onSeeds = pathname.startsWith('/seeds');
  const hasMessages = useAppStore((s) => s.messages.length > 0);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative" style={{ background: 'transparent' }}>
      {onHome || onSeeds ? <Galaxy dim={onHome && hasMessages} /> : <div className="page-glow" aria-hidden="true" />}

      {/* Health check banner */}
      {apiReachable === false && (
        <div
          className="flex items-center gap-3 px-4 py-2 text-sm shrink-0"
          style={{
            background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-error) 15%, transparent)',
            color: 'var(--color-text)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: 'var(--color-error)' }}
          />
          <span>Cannot reach Phibe backend</span>
          <button
            onClick={() => navigate('/settings')}
            className="text-sm underline cursor-pointer ml-auto shrink-0"
            style={{ color: 'var(--color-accent)' }}
          >
            Change URL
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative z-10">
        <Sidebar />
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => useAppStore.getState().setSidebarOpen(false)}
          />
        )}
        <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden" style={{ background: 'transparent' }}>
          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-[2]" style={{ paddingTop: 66 }}>
            <div key={pathname} className="route-enter flex-1 flex flex-col min-w-0 min-h-0">
              <Outlet />
            </div>
          </div>
          {/* The voice card sits in the middle of the content area, above the message box. */}
          <VoiceOverlay />
        </main>
      </div>
      <Island />
      <PhibeBubble />
    </div>
  );
}
