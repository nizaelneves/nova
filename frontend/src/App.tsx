import { useEffect } from 'react';
import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { AgentsPage } from './pages/AgentsPage';
import { TasksPage } from './pages/TasksPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { PingsPage } from './pages/PingsPage';
import { FinancesPage } from './pages/FinancesPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { CommandPalette } from './components/CommandPalette';
import { Toaster } from './components/ui/sonner';
import { useAppStore } from './lib/store';
import { fetchModels, fetchServerInfo, isTauri } from './lib/api';
import { notifyPhi } from './lib/phiPresence';

// While developing, `__phi.notify('done', 'text')` in the console previews the floating button's badges.
if (import.meta.env.DEV) (window as unknown as { __phi?: unknown }).__phi = { notify: notifyPhi };

export default function App() {
  const setModels = useAppStore((s) => s.setModels);
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setServerInfo = useAppStore((s) => s.setServerInfo);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  // Phi is dark only: the official palette has no light variant.
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
          <Route path="data-sources" element={<DataSourcesPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="pings" element={<PingsPage />} />
          <Route path="finances" element={<FinancesPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" closeButton />
      {commandPaletteOpen && <CommandPalette />}
    </>
  );
}
