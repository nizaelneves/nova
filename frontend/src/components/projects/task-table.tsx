import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { StrikeText } from '../StrikeText';
import { TaskCheck } from '../TaskCheck';
import {
  DEFAULT_VIEW, PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER,
  buildGroups, type GroupBy, type SortKey, type TableView, type TaskGroup,
} from '../../lib/task-table';
import { type Area, type Priority, type Status, type Task, type TaskCreate, toDue, todayLocal } from '../../lib/tasks-api';
import { ProjectColorContext } from './tasks';

type Change = Partial<TaskCreate>;

/** A coloured pill that opens a short menu to pick one value (the Monday-style label cell). */
function PillMenu<T extends string>({ value, options, label, onPick }: {
  value: T;
  options: { id: T; label: string; color: string }[];
  label: string;
  onPick: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div ref={ref} className="tt-pillwrap">
      <button type="button" className="tt-pill" style={{ background: current.color }} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current.label}`} onClick={() => setOpen(!open)}>
        {current.label}
      </button>
      {open && (
        <div className="tt-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === value} className="tt-pill" style={{ background: o.color }} onClick={() => { setOpen(false); if (o.id !== value) onPick(o.id); }}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_OPTIONS = STATUS_ORDER.map((s) => ({ id: s, label: STATUS_LABEL[s], color: STATUS_COLOR[s] }));
const PRIORITY_OPTIONS = PRIORITY_ORDER.map((p) => ({ id: p, label: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p] }));

/** The title: click to rename in place, Enter saves, Escape leaves it as it was. */
function TitleCell({ task, onRename, onOpen }: { task: Task; onRename: (title: string) => void; onOpen: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.title);
  useEffect(() => setText(task.title), [task.title]);
  const finish = (save: boolean) => {
    setEditing(false);
    const clean = text.trim();
    if (save && clean && clean !== task.title) onRename(clean);
    else setText(task.title);
  };
  if (editing) {
    return (
      <input autoFocus className="tt-title-input" value={text} aria-label="Task title" onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }} />
    );
  }
  return (
    <div className="tt-title">
      <button type="button" className="tt-title-btn" title="Click to rename" onClick={() => setEditing(true)}>
        <StrikeText done={task.status === 'done'}>{task.title}</StrikeText>
      </button>
      <button type="button" className="tt-open" aria-label={`Open ${task.title}`} title="Open" onClick={onOpen}><Icon name="pen" size={14} /></button>
    </div>
  );
}

const Row = memo(function Row({ task, today, onOpen, onChange }: { task: Task; today: string; onOpen: (t: Task) => void; onChange: (t: Task, c: Change) => void }) {
  const color = useContext(ProjectColorContext)(task.area_id);
  const done = task.status === 'done';
  const overdue = !done && task.due.slice(0, 10) < today;
  return (
    <div className="tt-row" role="row" data-done={done || undefined}>
      <div role="cell"><TaskCheck done={done} size={18} label={done ? 'Mark not done' : 'Mark done'} onClick={() => onChange(task, { status: done ? 'todo' : 'done' })} /></div>
      <div role="cell"><TitleCell task={task} onRename={(title) => onChange(task, { title })} onOpen={() => onOpen(task)} /></div>
      <div role="cell" className="tt-project"><i style={{ background: color }} />{task.area || 'Personal'}</div>
      <div role="cell"><PillMenu<Priority | 'none'> label="Priority" value={task.priority ?? 'none'} options={PRIORITY_OPTIONS} onPick={(p) => onChange(task, { priority: p === 'none' ? null : p })} /></div>
      <div role="cell"><PillMenu<Status> label="Status" value={task.status} options={STATUS_OPTIONS} onPick={(status) => onChange(task, { status })} /></div>
      <div role="cell">
        <input type="date" className="tt-date" data-overdue={overdue || undefined} aria-label="Deadline" value={task.due.slice(0, 10)}
          onChange={(e) => { if (e.target.value) onChange(task, toDue(e.target.value, task.all_day ? '' : task.due.slice(11, 16))); }} />
      </div>
    </div>
  );
});

function GroupBlock({ group, today, onOpen, onChange, onAdd }: { group: TaskGroup; today: string; onOpen: (t: Task) => void; onChange: (t: Task, c: Change) => void; onAdd: (b: TaskCreate) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [title, setTitle] = useState('');
  const accent = group.defaults.status ? STATUS_COLOR[group.defaults.status] : group.defaults.priority !== undefined ? PRIORITY_COLOR[group.defaults.priority ?? 'none'] : 'var(--color-accent)';
  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    onAdd({ title: clean, ...toDue(todayLocal(), ''), ...group.defaults });
    setTitle('');
  };
  return (
    <section className="tt-group" style={{ ['--g' as string]: accent }}>
      <button type="button" className="tt-ghead" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
        <Icon name="alt-arrow-down" size={16} className="tt-chev" />
        <b>{group.label}</b>
        <span>{group.tasks.length}</span>
      </button>
      {!collapsed && (
        <div role="rowgroup">
          <div className="tt-row tt-cols" role="row">
            <span role="columnheader" /><span role="columnheader">Task</span><span role="columnheader">Project</span>
            <span role="columnheader">Priority</span><span role="columnheader">Status</span><span role="columnheader">Deadline</span>
          </div>
          {group.tasks.map((t) => <Row key={t.id} task={t} today={today} onOpen={onOpen} onChange={onChange} />)}
          <div className="tt-row tt-add">
            <span />
            <input value={title} placeholder="+ Add task" aria-label={`Add task to ${group.label}`} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </div>
        </div>
      )}
    </section>
  );
}

const GROUP_BY: { id: GroupBy; label: string }[] = [{ id: 'status', label: 'Status' }, { id: 'priority', label: 'Priority' }, { id: 'project', label: 'Project' }, { id: 'none', label: 'No Grouping' }];
const SORTS: { id: SortKey; label: string }[] = [{ id: 'due', label: 'Deadline' }, { id: 'title', label: 'Title' }, { id: 'priority', label: 'Priority' }, { id: 'status', label: 'Status' }];

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="tt-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Tasks as a grouped table: edit every cell in place, search, filter, sort and regroup. */
export function TaskTable({ tasks, areas, onOpen, onChange, onAdd }: {
  tasks: Task[];
  areas: Area[];
  onOpen: (t: Task) => void;
  onChange: (t: Task, c: Change) => void;
  onAdd: (b: TaskCreate) => void;
}) {
  const [view, setView] = useState<TableView>(DEFAULT_VIEW);
  const set = (changes: Partial<TableView>) => setView((v) => ({ ...v, ...changes }));
  const groups = useMemo(() => buildGroups(tasks, areas, view), [tasks, areas, view]);
  const today = todayLocal();
  return (
    <div className="tt">
      <div className="tt-tools">
        <label className="tt-search">
          <Icon name="magnifer" size={15} />
          <input value={view.query} placeholder="Search" aria-label="Search tasks" onChange={(e) => set({ query: e.target.value })} />
        </label>
        <Select label="Status" value={view.status} options={[{ id: 'all', label: 'All' }, ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_LABEL[s] }))]} onChange={(status) => set({ status })} />
        <Select label="Priority" value={view.priority} options={[{ id: 'all', label: 'All' }, ...PRIORITY_ORDER.map((p) => ({ id: p, label: PRIORITY_LABEL[p] }))]} onChange={(priority) => set({ priority })} />
        <Select label="Sort" value={view.sort} options={SORTS} onChange={(sort) => set({ sort })} />
        <button type="button" className="tt-dir" aria-label={view.desc ? 'Descending' : 'Ascending'} title={view.desc ? 'Descending' : 'Ascending'} onClick={() => set({ desc: !view.desc })}>
          <Icon name="sort" size={15} />{view.desc ? 'Desc' : 'Asc'}
        </button>
        <Select label="Group" value={view.groupBy} options={GROUP_BY} onChange={(groupBy) => set({ groupBy })} />
      </div>
      <div className="tt-scroll" role="table" aria-label="Tasks">
        {groups.every((g) => g.tasks.length === 0) && view.groupBy !== 'status' && (
          <div className="text-xs px-1 py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>Nothing here.</div>
        )}
        {groups.map((g) => <GroupBlock key={g.key} group={g} today={today} onOpen={onOpen} onChange={onChange} onAdd={onAdd} />)}
      </div>
    </div>
  );
}
