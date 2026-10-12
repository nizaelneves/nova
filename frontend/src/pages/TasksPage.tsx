import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../components/Icon';
import { Popup } from '../components/Popup';
import {
  Area,
  Priority,
  RecurrenceFreq,
  Status,
  Task,
  TaskCreate,
  TasksApiError,
  createArea,
  createTask,
  deleteArea,
  deleteTask,
  fetchAreas,
  fetchKanban,
  fetchSummary,
  renameArea,
  setTaskStatus,
  toDue,
  todayLocal,
  updateTask,
} from '../lib/tasks-api';
import { RollNumber } from '../components/RollNumber';
import { StrikeText } from '../components/StrikeText';
import { TaskCheck } from '../components/TaskCheck';
import { LIST_BUCKET_LABEL, LIST_BUCKET_ORDER, taskListBucket } from '../lib/tasks';

const COLUMNS: { status: Status; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'doing', label: 'Doing' },
  { status: 'done', label: 'Done' },
];

type Tab = 'all' | 'today' | 'upcoming' | 'overdue';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'all', label: 'All' },
];

type View = 'kanban' | 'list';
const VIEWS: { id: View; label: string }[] = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'list', label: 'List' },
];

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--color-error)',
  medium: '#d9a441',
  low: 'var(--color-text-tertiary)',
};

function apiErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function formatDue(task: Task): string {
  const d = task.all_day ? new Date(`${task.due}T00:00`) : new Date(task.due);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (task.all_day) return dateStr;
  return `${dateStr}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function formatTimeShort(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Shared bits: priority CSS var + the meta-chip row reused by every view
// ---------------------------------------------------------------------------

/** Sets the `--task-priority-color` custom property a card/row reads for its
 * left accent bar; falls back to a neutral border when no priority is set. */
function priorityStyle(task: Task): React.CSSProperties {
  return { ['--task-priority-color' as string]: task.priority ? PRIORITY_COLOR[task.priority] : 'var(--color-border)' };
}

/** The due-date, recurrence, area and priority chips shown on both the
 * Kanban card and the List row — factored out once so the two views never
 * drift apart in how they render the same `Task`. */
function TaskMetaChips({ task }: { task: Task }) {
  return (
    <>
      {task.priority && (
        <span className="task-chip" style={{ color: PRIORITY_COLOR[task.priority] }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: PRIORITY_COLOR[task.priority],
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {task.priority[0].toUpperCase() + task.priority.slice(1)}
        </span>
      )}
      <span className="task-chip">
        <Icon name="calendar" size={11} />
        {formatDue(task)}
      </span>
      {task.recurrence && (
        <span className="task-chip" title="Repeats">
          <Icon name="repeat" size={11} />
        </span>
      )}
      {task.area && <span className="task-chip">{task.area}</span>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Task card (Kanban)
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onOpen,
  onDragStart,
}: {
  task: Task;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="task-card"
      style={priorityStyle(task)}
    >
      <div className="task-card-title" style={{ opacity: task.status === 'done' ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
        <StrikeText done={task.status === 'done'}>{task.title}</StrikeText>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <TaskMetaChips task={task} />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Task list row (List view)
// ---------------------------------------------------------------------------

function TaskListRow({
  task,
  onOpen,
  onToggleDone,
}: {
  task: Task;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const done = task.status === 'done';
  return (
    <div className="task-list-row" data-done={done} style={priorityStyle(task)} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <TaskCheck done={done} label={done ? 'Mark not done' : 'Mark done'} onClick={onToggleDone} />
      <span className="task-list-title flex-1 text-sm truncate" style={{ color: 'var(--color-text)' }}>
        <StrikeText done={done}>{task.title}</StrikeText>
      </span>
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        <TaskMetaChips task={task} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function TaskListView({
  tasks,
  onOpen,
  onToggleDone,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}) {
  const now = new Date();
  const todayStr = todayLocal();

  const groups = useMemo(() => {
    const buckets = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = taskListBucket(t, now, todayStr);
      const list = buckets.get(key) ?? [];
      list.push(t);
      buckets.set(key, list);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => a.due.localeCompare(b.due));
    }
    return LIST_BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => [b, buckets.get(b)!] as const);
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tasks.length === 0) {
    return <div className="text-xs px-1 py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>Nothing here.</div>;
  }

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="task-progress" data-complete={allDone} aria-live="polite">
        <TaskCheck done={allDone} label={allDone ? 'All tasks done' : 'Tasks in progress'} size={18} />
        <span>{allDone ? 'All done' : 'Progress'}</span>
        <span className="task-progress-count">
          <span className="sr-only">{doneCount} of {tasks.length} tasks done</span>
          <span aria-hidden="true" style={{ display: 'inline-flex' }}>
            <RollNumber value={doneCount} />
            <span>/{tasks.length}</span>
          </span>
        </span>
      </div>
      {groups.map(([bucket, items]) => (
        <div key={bucket} className="flex flex-col gap-1.5">
          <div className="task-list-section-head">
            {LIST_BUCKET_LABEL[bucket]}
            <span className="task-tab-count">{items.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((t) => (
              <TaskListRow key={t.id} task={t} onOpen={() => onOpen(t)} onToggleDone={() => onToggleDone(t)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit task pop-up
// ---------------------------------------------------------------------------

export function TaskForm({
  areas,
  task,
  onClose,
  onSaved,
  onDeleted,
}: {
  areas: Area[];
  task: Task | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState(task ? task.due.slice(0, 10) : todayLocal());
  const [time, setTime] = useState(task && !task.all_day ? task.due.slice(11, 16) : '');
  const [areaId, setAreaId] = useState(task?.area_id ?? areas[0]?.id ?? '');
  const [priority, setPriority] = useState<'' | Priority>(task?.priority ?? '');
  const [status, setStatus] = useState<Status>(task?.status ?? 'todo');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [freq, setFreq] = useState<'' | RecurrenceFreq>(task?.recurrence?.freq ?? '');
  const [interval, setIntervalValue] = useState(task?.recurrence?.interval ?? 1);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    const clean = title.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const body: TaskCreate = {
        title: clean,
        ...toDue(date, time),
        area_id: areaId || undefined,
        priority: priority || null,
        status,
        notes,
        recurrence: freq ? { freq, interval } : null,
      };
      if (task) await updateTask(task.id, body);
      else await createTask(body);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    try {
      await deleteTask(task.id);
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const field = { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };
  return (
    <Popup title={task ? 'Edit task' : 'New task'} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="w-full text-sm px-3 py-2 rounded-lg outline-none"
          style={field}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Due date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Time (optional — all day otherwise)
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Area
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="">No area</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as '' | Priority)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="">None</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Column
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="todo">To Do</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Repeat
            <select value={freq} onChange={(e) => setFreq(e.target.value as '' | RecurrenceFreq)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="">Doesn't repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {freq && (
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Every
              <input type="number" min={1} value={interval}
                onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
            </label>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={3}
          className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
          style={field}
        />
        <div className="flex items-center justify-between mt-1">
          {task ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5"
              style={{ color: 'var(--color-error)' }}>
              <Icon name="trash-bin-minimalistic" size={15} /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={!title.trim() || saving}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <Popup title="Delete this task?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>{task?.title}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Cancel
            </button>
            <button type="button" onClick={() => void remove()}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer"
              style={{ background: 'var(--color-error)', color: '#fff' }}>
              Delete
            </button>
          </div>
        </Popup>
      )}
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Areas pop-up
// ---------------------------------------------------------------------------

function AreasPopup({
  areas,
  onClose,
  onChanged,
}: {
  areas: Area[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Area | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const add = async () => {
    const clean = name.trim();
    if (!clean) return;
    try {
      await createArea(clean);
      setName('');
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const rename = async (id: string) => {
    const clean = draft.trim();
    if (!clean) { setEditing(null); return; }
    try {
      await renameArea(id, clean);
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async (area: Area, withMoveTo?: string) => {
    try {
      await deleteArea(area.id, withMoveTo);
      setPendingDelete(null);
      onChanged();
    } catch (err) {
      if (err instanceof TasksApiError && typeof err.detail === 'object' && err.detail && 'task_count' in (err.detail as any)) {
        setPendingDelete(area);
        setMoveTo(areas.find((a) => a.id !== area.id)?.id ?? '');
      } else {
        toast.error(apiErrorMessage(err));
      }
    }
  };

  const field = { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };
  return (
    <Popup title="Areas" onClose={onClose}>
      <div className="flex flex-col gap-2 mb-3">
        {areas.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            {editing === a.id ? (
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void rename(a.id)}
                onBlur={() => void rename(a.id)}
                className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--color-text)' }} />
            ) : (
              <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>
                {a.name} <span style={{ color: 'var(--color-text-tertiary)' }}>· {a.task_count}</span>
              </span>
            )}
            <button type="button" onClick={() => { setEditing(a.id); setDraft(a.name); }} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
              <Icon name="pen" size={14} />
            </button>
            <button type="button" onClick={() => void remove(a)} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-error)' }}>
              <Icon name="trash-bin-minimalistic" size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New area"
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
        <button type="button" onClick={() => void add()} disabled={!name.trim()}
          className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
          Add
        </button>
      </div>
      {pendingDelete && (
        <Popup title={`Move ${pendingDelete.task_count} task(s) first`} onClose={() => setPendingDelete(null)}>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            "{pendingDelete.name}" still has tasks. Choose where they go.
          </p>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer mb-3" style={field}>
            {areas.filter((a) => a.id !== pendingDelete.id).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPendingDelete(null)}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Cancel
            </button>
            <button type="button" onClick={() => void remove(pendingDelete, moveTo)} disabled={!moveTo}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-error)', color: '#fff' }}>
              Move and delete
            </button>
          </div>
        </Popup>
      )}
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TasksPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('kanban');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [summary, setSummary] = useState<Record<'today' | 'upcoming' | 'overdue', number> | null>(null);
  const [editing, setEditing] = useState<Task | null | 'new'>(null);
  const [showAreas, setShowAreas] = useState(false);
  const [dragOver, setDragOver] = useState<Status | null>(null);

  const load = useCallback(() => {
    fetchAreas().then(setAreas).catch(() => setAreas([]));
    fetchSummary().then(setSummary).catch(() => setSummary(null));
    fetchKanban(areaFilter || undefined)
      .then((columns) => setTasks(Object.values(columns).flat()))
      .catch(() => setTasks([]));
  }, [areaFilter]);

  useEffect(load, [load]);

  // Tasks passed through the Today/Upcoming/Overdue/All tab filter — shared
  // by the Kanban and List views. (Calendar picks its own day instead.)
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (tab === 'all') return tasks;
    const now = new Date();
    const today = todayLocal();
    return tasks.filter((t) => {
      if (t.status === 'done') return true;
      const day = t.due.slice(0, 10);
      const isPast = t.all_day ? day < today : new Date(t.due) < now;
      const isToday = day === today;
      if (tab === 'today') return isToday && !isPast;
      if (tab === 'overdue') return isPast;
      if (tab === 'upcoming') return day > today;
      return true;
    });
  }, [tasks, tab]);

  const board = useMemo(() => {
    const grouped: Record<Status, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of filteredTasks) grouped[t.status].push(t);
    return grouped;
  }, [filteredTasks]);

  const move = async (id: string, status: Status) => {
    setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status } : t)) ?? prev);
    try {
      await setTaskStatus(id, status);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      load();
    }
  };

  const toggleDone = (task: Task) => void move(task.id, task.status === 'done' ? 'todo' : 'done');

  return (
    <div className="flex flex-col h-full px-6 py-5 gap-4 overflow-y-auto">
      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer"
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            <option value="">All Workspaces</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="button" onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
            <Icon name="add-circle" size={16} /> New Task
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="pings-tab-pill">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} className="pings-tab-pill-item" data-active={view === v.id}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {(
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="composer-chip"
              data-filled="true"
              data-active={tab === t.id}
            >
              {t.label}
              {summary && t.id !== 'all' && (
                <span className="task-tab-count">{summary[t.id]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {tasks === null ? (
        <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="task-column"
              data-over={dragOver === col.status}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.status); }}
              onDragLeave={() => setDragOver((d) => (d === col.status ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/task-id');
                if (id) void move(id, col.status);
              }}
            >
              <div className="task-column-head">
                {col.label}
                <span className="task-tab-count">{board[col.status].length}</span>
              </div>
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-1">
                {board[col.status].length === 0 && (
                  <div className="text-xs px-1 py-3 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    Nothing here
                  </div>
                )}
                {board[col.status].map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onOpen={() => setEditing(t)}
                    onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TaskListView tasks={filteredTasks} onOpen={(t) => setEditing(t)} onToggleDone={toggleDone} />
      )}

      {editing && (
        <TaskForm
          areas={areas}
          task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onDeleted={() => { setEditing(null); load(); }}
        />
      )}
      {showAreas && (
        <AreasPopup areas={areas} onClose={() => setShowAreas(false)} onChanged={load} />
      )}
    </div>
  );
}
