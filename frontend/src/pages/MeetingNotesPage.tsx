import { ModuleHeader } from '../components/ModuleHeader';

export function MeetingNotesPage() {
  return (
    <div className="fin-root h-full overflow-y-auto">
      <div className="fin-wrap">
        <ModuleHeader icon="transcript" title="Scribe" />
      </div>
    </div>
  );
}
