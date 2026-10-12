import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { AgentsPage } from './pages/AgentsPage';
import { SeedsPage } from './pages/SeedsPage';
import { TutorPage } from './pages/TutorPage';
import { DeskPage } from './pages/DeskPage';
import { FinancesPage } from './pages/FinancesPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { CommandPalette } from './components/CommandPalette';
import { Toaster } from './components/ui/sonner';
import { useAppStore } from './lib/store';
import { fetchModels, fetchServerInfo, isTauri } from './lib/api';
import { notifyPhibe } from './lib/phibePresence';

// While developing, `__phibe.notify('done', 'text')` in the console previews the floating button's badges.
if (import.meta.env.DEV) (window as unknown as { __phibe?: unknown }).__phibe = { notify: notifyPhibe };

export default function App() {
  const setModels = useAppStore((s) => s.setModels);
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setServerInfo = useAppStore((s) => s.setServerInfo);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  // Phibe is dark only: the official palette has no light variant.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
  }, []);

  // Sync overlay conversations into the main app
  const importOverlay = useAppStore((s) => s.importOverlayConversation);
  useEffect(() => {
    if (!isTauri()) return;
    importOverlay();
    const interval = setInterval(importOverlay, 5000);
    return () => clearInterval(interval);
  }, [importOverlay]);

  // Fetch models on mount
  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m);
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch server info
  useEffect(() => {
    fetchServerInfo().then(setServerInfo).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ChatPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Agents and Data Sources now live inside Settings. */}
          <Route path="data-sources" element={<Navigate to="/settings?tab=data-sources" replace />} />
          <Route path="agents" element={<Navigate to="/settings?tab=agents" replace />} />
          <Route path="desk" element={<DeskPage />} />
          <Route path="workspaces" element={<Navigate to="/desk?tab=workspaces" replace />} />
          <Route path="seeds" element={<SeedsPage />} />
          <Route path="tutor" element={<TutorPage />} />
          <Route path="meeting-notes" element={<Navigate to="/desk?tab=meeting-notes" replace />} />
          <Route path="tasks" element={<Navigate to="/desk?tab=tasks" replace />} />
          <Route path="pings" element={<Navigate to="/desk?tab=pings" replace />} />
          <Route path="finances" element={<FinancesPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" closeButton />
      {commandPaletteOpen && <CommandPalette />}
    </>
  );
}
