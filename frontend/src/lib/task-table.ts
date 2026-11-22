import type { Area, Priority, Status, Task } from './tasks-api';

export type GroupBy = 'status' | 'priority' | 'project' | 'none';
export type SortKey = 'due' | 'title' | 'priority' | 'status';

export interface TableView {
  query: string;
  status: Status | 'all';
  priority: Priority | 'none' | 'all';
  groupBy: GroupBy;
  sort: SortKey;
  desc: boolean;
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  /** What a task added inside this group starts with. */
  defaults: { status?: Status; priority?: Priority | null; area_id?: string };
}

export const STATUS_ORDER: Status[] = ['todo', 'doing', 'done'];
export const STATUS_LABEL: Record<Status, string> = { todo: 'Coming Next', doing: 'Doing', done: 'Done' };
export const STATUS_COLOR: Record<Status, string> = { todo: '#8b93a7', doing: '#d9a441', done: '#1fae7a' };
export const PRIORITY_ORDER: (Priority | 'none')[] = ['high', 'medium', 'low', 'none'];
export const PRIORITY_LABEL: Record<Priority | 'none', string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };
export const PRIORITY_COLOR: Record<Priority | 'none', string> = { high: '#e5484d', medium: '#d9a441', low: '#3e8fe0', none: '#8b93a7' };

export const DEFAULT_VIEW: TableView = { query: '', status: 'all', priority: 'all', groupBy: 'status', sort: 'due', desc: false };

const rank = (order: readonly string[], value: string) => order.indexOf(value);

function compare(a: Task, b: Task, sort: SortKey): number {
  if (sort === 'title') return a.title.localeCompare(b.title);
  if (sort === 'priority') return rank(PRIORITY_ORDER, a.priority ?? 'none') - rank(PRIORITY_ORDER, b.priority ?? 'none');
  if (sort === 'status') return rank(STATUS_ORDER, a.status) - rank(STATUS_ORDER, b.status);
  return a.due.localeCompare(b.due);
}

/** Filter, sort and group in one pass, so the table only has to draw the result. */
export function buildGroups(tasks: Task[], areas: Area[], view: TableView): TaskGroup[] {
  const q = view.query.trim().toLowerCase();
  const kept = tasks
    .filter((t) => (view.status === 'all' || t.status === view.status)
      && (view.priority === 'all' || (t.priority ?? 'none') === view.priority)
      && (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)))
    .sort((a, b) => (view.desc ? -1 : 1) * compare(a, b, view.sort) || a.title.localeCompare(b.title));

  if (view.groupBy === 'none') return [{ key: 'all', label: 'All Tasks', tasks: kept, defaults: {} }];

  if (view.groupBy === 'status') {
    // Every stage stays, even empty, so a task can be added to it.
    return STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], tasks: kept.filter((t) => t.status === s), defaults: { status: s } }));
  }

  if (view.groupBy === 'priority') {
    return PRIORITY_ORDER
      .map((p) => ({ key: p, label: PRIORITY_LABEL[p], tasks: kept.filter((t) => (t.priority ?? 'none') === p), defaults: { priority: p === 'none' ? null : p } }))
      .filter((g) => g.tasks.length);
  }

  const projects = [{ id: '', name: 'Personal' }, ...[...areas].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ id: a.id, name: a.name }))];
  return projects
    .map((p) => ({ key: p.id || 'personal', label: p.name, tasks: kept.filter((t) => (t.area_id ?? '') === p.id), defaults: p.id ? { area_id: p.id } : {} }))
    .filter((g) => g.tasks.length);
}
