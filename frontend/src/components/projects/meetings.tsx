import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { type Meeting, addMeeting, loadMeetings, removeMeeting, saveMeetings, sortMeetings, updateMeeting } from '../../lib/meetings';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const label = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** A project's meeting notes: the list on the left, the page of text in the middle. */
export function Meetings({ projectId }: { projectId: string }) {
  const [store, setStore] = useState(loadMeetings);
  const [picked, setPicked] = useState<string | null>(null);
  const list: Meeting[] = store[projectId] ?? [];
  const sorted = sortMeetings(list);
  const current = sorted.find((m) => m.id === picked) ?? sorted[0] ?? null;

  useEffect(() => { saveMeetings(store); }, [store]);

  const put = (next: Meeting[]) => setStore((s) => ({ ...s, [projectId]: next }));
  const add = () => {
    const made = addMeeting(list, today());
    put(made.list);
    setPicked(made.meeting.id);
  };
  const edit = (changes: Partial<Omit<Meeting, 'id'>>) => current && put(updateMeeting(list, current.id, changes));

  return (
    <div className="pj-meet">
      <aside className="pj-meet-list">
        <button type="button" className="pj-add" onClick={add}><Icon name="add-circle" size={16} /> New Meeting</button>
        {sorted.map((m) => (
          <button key={m.id} type="button" className="pj-meet-item" data-on={m.id === current?.id} onClick={() => setPicked(m.id)}>
            <b>{m.title || 'Untitled Meeting'}</b>
            <small>{label(m.date)}</small>
            <span>{m.notes.slice(0, 80) || 'No notes yet.'}</span>
          </button>
        ))}
      </aside>
      {current ? (
        <section className="pj-meet-page" key={current.id}>
          <div className="pj-meet-bar">
            <input type="date" value={current.date} onChange={(e) => e.target.value && edit({ date: e.target.value })} aria-label="Meeting Date" />
            <button type="button" aria-label="Delete Meeting" onClick={() => { put(removeMeeting(list, current.id)); setPicked(null); }}><Icon name="trash-bin-minimalistic" size={16} /></button>
          </div>
          <input className="pj-meet-title" value={current.title} onChange={(e) => edit({ title: e.target.value })} placeholder="Meeting Title" aria-label="Meeting Title" />
          <textarea value={current.notes} onChange={(e) => edit({ notes: e.target.value })} placeholder="Write the minutes here: who was there, what was decided, what comes next." aria-label="Meeting Notes" />
        </section>
      ) : (
        <div className="pj-soon">No meetings yet. Add one to start taking notes.</div>
      )}
    </div>
  );
}
