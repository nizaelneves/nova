import { createContext, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { Popup } from '../Popup';
import {
  Area,
  Priority,
  RecurrenceFreq,
  Status,
  Task,
  TaskCreate,
  createTask,
  deleteTask,
  toDue,
  todayLocal,
  updateTask,
} from '../../lib/tasks-api';
import { PERSONAL_COLOR } from '../../lib/projects';
import { StrikeText } from '../StrikeText';
import { TaskCheck } from '../TaskCheck';
import { LIST_BUCKET_LABEL, LIST_BUCKET_ORDER, taskListBucket } from '../../lib/tasks';

const COLUMNS: { status: Status; label: string }[] = [
  { status: 'todo', label: 'Coming Next' },
  { status: 'doing', label: 'Doing' },
  { status: 'done', label: 'Done' },
];

/** The colour of a project (an area id, or null for personal tasks); set by the Projects screen. */
export const ProjectColorContext = createContext<(areaId: string | null) => string>(() => PERSONAL_COLOR);

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--color-error)',
  medium: '#d9a441',
  low: 'var(--color-text-tertiary)',
};

export function apiErrorMessage(err: unknown): string {
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
  const color = useContext(ProjectColorContext)(task.area_id);
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
      <span className="task-chip">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
        {task.area || 'Personal'}
      </span>
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
  const color = useContext(ProjectColorContext)(task.area_id);
  return (
    <button type="button" draggable onDragStart={onDragStart} onClick={onOpen} className="kb-card" data-done={task.status === 'done' || undefined}>
      <span className="kb-tag" style={{ ['--c' as string]: color }}>{task.area || 'Personal'}</span>
      <b className="kb-title"><StrikeText done={task.status === 'done'}>{task.title}</StrikeText></b>
      {task.notes && <p className="kb-notes">{task.notes}</p>}
      <div className="kb-foot">
        <span className="task-chip"><Icon name="calendar" size={11} />{formatDue(task)}</span>
        {task.recurrence && <span className="task-chip" title="Repeats"><Icon name="repeat" size={11} /></span>}
        {task.priority && (
          <span className="task-chip" style={{ color: PRIORITY_COLOR[task.priority], marginLeft: 'auto' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[task.priority], display: 'inline-block' }} />
            {task.priority[0].toUpperCase() + task.priority.slice(1)}
          </span>
        )}
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

export function TaskListView({
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
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({});

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

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([bucket, items]) => (
        <div key={bucket} className="flex flex-col gap-1.5">
          <button type="button" className="tl-head" data-b={bucket} aria-expanded={!!openBuckets[bucket]} onClick={() => setOpenBuckets((o) => ({ ...o, [bucket]: !o[bucket] }))}>
            <Icon name="alt-arrow-down" size={16} className="tl-chev" />
            <b>{LIST_BUCKET_LABEL[bucket]}</b>
            <span>{items.length}</span>
          </button>
          {openBuckets[bucket] && (
            <div className="flex flex-col gap-1.5">
              {items.map((t) => (
                <TaskListRow key={t.id} task={t} onOpen={() => onOpen(t)} onToggleDone={() => onToggleDone(t)} />
              ))}
            </div>
          )}
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
  defaultAreaId = '',
  onClose,
  onSaved,
  onDeleted,
}: {
  areas: Area[];
  task: Task | null;
  defaultAreaId?: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState(task ? task.due.slice(0, 10) : todayLocal());
  const [time, setTime] = useState(task && !task.all_day ? task.due.slice(11, 16) : '');
  const [range, setRange] = useState(!!task?.start);
  const [startDate, setStartDate] = useState(task?.start ? task.start.slice(0, 10) : todayLocal());
  const [startTime, setStartTime] = useState(task?.start && !task.all_day ? task.start.slice(11, 16) : '');
  const [areaId, setAreaId] = useState(task ? task.area_id ?? '' : defaultAreaId);
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
      // A span is timed only when both ends have a time; otherwise it runs whole days.
      const timed = range ? !!(time && startTime) : !!time;
      const body: TaskCreate = {
        title: clean,
        ...toDue(date, timed ? time : ''),
        start: range ? (timed ? `${startDate}T${startTime}` : startDate) : null,
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
    <Popup title={task ? 'Edit Task' : 'New Task'} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task Title"
          className="w-full text-sm px-3 py-2 rounded-lg outline-none"
          style={field}
        />
        <div className="flex gap-1 text-xs" role="tablist">
          {([['Due Date', false], ['Start and End', true]] as const).map(([text, on]) => (
            <button key={text} type="button" role="tab" aria-selected={range === on} onClick={() => setRange(on)}
              className="px-3 py-1 rounded-lg cursor-pointer"
              style={{ background: range === on ? 'var(--color-surface)' : 'transparent', color: range === on ? 'var(--color-text)' : 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
              {text}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {range && (
            <>
              <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Start Date
                <input type="date" value={startDate} max={date} onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Start Time
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {range ? 'End Date' : 'Due Date'}
            <input type="date" value={date} min={range ? startDate : undefined} onChange={(e) => setDate(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {range ? 'End Time' : 'Time (Optional — All Day otherwise)'}
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Workspace
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="">Personal</option>
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
            Stage
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="todo">Coming Next</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Repeat
            <select value={freq} onChange={(e) => setFreq(e.target.value as '' | RecurrenceFreq)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="">Doesn't Repeat</option>
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
// Kanban board
// ---------------------------------------------------------------------------

export function TaskBoard({ tasks, onOpen, onMove }: { tasks: Task[]; onOpen: (task: Task) => void; onMove: (id: string, status: Status) => void }) {
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const board = useMemo(() => {
    const grouped: Record<Status, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) grouped[t.status].push(t);
    return grouped;
  }, [tasks]);

  return (
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
            if (id) onMove(id, col.status);
          }}
        >
          <div className="kb-head" data-s={col.status}>
            {col.label}
            <span>{board[col.status].length}</span>
          </div>
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
            {board[col.status].length === 0 && (
              <div className="text-xs px-1 py-3 text-center" style={{ color: 'var(--color-text-tertiary)' }}>Nothing here</div>
            )}
            {board[col.status].map((t) => (
              <TaskCard key={t.id} task={t} onOpen={() => onOpen(t)} onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
