import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { addNote, loadNotes, removeNote, saveNotes } from '../../lib/projectNotes';
import type { Task } from '../../lib/tasks-api';

const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The right column of a workspace: where the work stands (priorities, progress, what was finished lately)
 * and a box for quick notes, which stay on this device.
 */
export function WorkspaceSidebar({ id, tasks, color }: { id: string; tasks: Task[]; color: string }) {
  const [store, setStore] = useState(loadNotes);
  const [draft, setDraft] = useState('');
  const notes = store[id] ?? [];
  useEffect(() => { saveNotes(store); }, [store]);

  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');
  const priorities = open.filter((t) => t.priority === 'high').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const recent = [...done].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, 4);
  const pct = tasks.length ? Math.round((100 * done.length) / tasks.length) : 0;

  const save = () => {
    if (!draft.trim()) return;
    setStore((s) => ({ ...s, [id]: addNote(s[id] ?? [], draft, new Date()) }));
    setDraft('');
  };

  return (
    <aside className="pj-side" style={{ ['--c' as string]: color }} aria-label="Workspace overview">
      <div className="pj-side-body">
        <h3>Overview</h3>
        <p className="pj-side-sub">{open.length ? `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}, next up: ${[...open].sort((a, b) => a.due.localeCompare(b.due))[0].title}.` : 'Nothing open right now.'}</p>

        <h4>Priorities</h4>
        {priorities.length ? (
          <ul className="pj-bul">
            {priorities.map((t) => <li key={t.id}>{t.title}<small>{dayLabel(t.due)}</small></li>)}
          </ul>
        ) : <p className="pj-side-none">No high priority tasks.</p>}

        <h4>Current Progress</h4>
        <div className="pj-prog">
          <div className="pj-prog-head"><span><Icon name="checklist-minimalistic" size={15} />{done.length}/{tasks.length} tasks complete</span><b>{pct}%</b></div>
          <i className="pj-prog-bar"><u style={{ width: `${pct}%` }} /></i>
          {recent.map((t) => <div key={t.id} className="pj-prog-row"><Icon name="check-circle" size={16} />{t.title}</div>)}
          {!recent.length && <p className="pj-side-none">Nothing finished yet.</p>}
        </div>

        {notes.length > 0 && (
          <>
            <h4>Quick Notes</h4>
            <ul className="pj-notes">
              {notes.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <span>{n.text}</span>
                  <button type="button" aria-label="Delete note" onClick={() => setStore((s) => ({ ...s, [id]: removeNote(s[id] ?? [], n.id) }))}><Icon name="close-circle" size={14} /></button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form className="pj-quick" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <textarea value={draft} rows={2} placeholder="Add quick notes" aria-label="Add quick notes" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }} />
        <button type="submit" disabled={!draft.trim()} aria-label="Save note"><Icon name="arrow-up" size={16} /></button>
      </form>
    </aside>
  );
}
