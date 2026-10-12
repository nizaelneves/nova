import { useSearchParams } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { MeetingNotesPage } from './MeetingNotesPage';
import { PingsPage } from './PingsPage';
import { TasksPage } from './TasksPage';
import { WorkspacesPage } from './WorkspacesPage';

const TABS = [
  { id: 'workspaces', label: 'Workspaces', icon: 'widget-2', Page: WorkspacesPage },
  { id: 'tasks', label: 'Tasks', icon: 'checklist-minimalistic', Page: TasksPage },
  { id: 'pings', label: 'Pings', icon: 'bell', Page: PingsPage },
  { id: 'meeting-notes', label: 'Meeting Notes', icon: 'transcript', Page: MeetingNotesPage },
] as const satisfies readonly { id: string; label: string; icon: IconName; Page: () => React.ReactNode }[];

/** Your Desk: Workspaces, Tasks, Pings and Meeting Notes under one menu entry. The tab lives in the URL (?tab=). */
export function DeskPage() {
  const [params, setParams] = useSearchParams();
  const current = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="prod-bar" role="tablist" aria-label="Your Desk">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={current.id === t.id} data-active={current.id === t.id}
            className="prod-tab" onClick={() => setParams({ tab: t.id }, { replace: true })}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <current.Page />
      </div>
    </div>
  );
}
