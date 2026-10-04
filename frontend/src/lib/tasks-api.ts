import { apiFetch } from './api';

export type Priority = 'high' | 'medium' | 'low';
export type Status = 'todo' | 'doing' | 'done';
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  interval?: number;
  weekdays?: number[];
  until?: string;
  count?: number;
}

export interface Area {
  id: string;
  name: string;
  task_count: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  area_id: string | null;
  area: string;
  due: string;
  all_day: boolean;
  priority: Priority | null;
  status: Status;
  recurrence: Recurrence | null;
  series_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskCreate {
  title: string;
  due: string;
  all_day: boolean;
  area_id?: string;
  priority?: Priority | null;
  status?: Status;
  notes?: string;
  recurrence?: Recurrence | null;
}

export type TaskUpdate = Partial<TaskCreate>;

/** An error from the tasks API. `detail` is the raw JSON body when it wasn't a plain string. */
export class TasksApiError extends Error {
  detail: unknown;
  constructor(message: string, detail: unknown) {
    super(message);
    this.name = 'TasksApiError';
    this.detail = detail;
  }
}

async function tasksJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/tasks${path}`, init);
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // Not JSON; keep the status text.
    }
    const message = typeof detail === 'string' ? detail : (detail as any)?.message || `Request failed: ${res.status}`;
    throw new TasksApiError(message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchAreas = (): Promise<Area[]> => tasksJson<{ areas: Area[] }>('/areas').then((r) => r.areas);
export const createArea = (name: string): Promise<Area> => tasksJson('/areas', { ...json({ name }), method: 'POST' });
export const renameArea = (id: string, name: string): Promise<Area> =>
  tasksJson(`/areas/${id}`, { ...json({ name }), method: 'PATCH' });
export const deleteArea = (id: string, moveTo?: string): Promise<void> =>
  tasksJson(`/areas/${id}${moveTo ? `?move_to=${encodeURIComponent(moveTo)}` : ''}`, { method: 'DELETE' });

export const fetchKanban = (areaId?: string): Promise<Record<Status, Task[]>> =>
  tasksJson<{ columns: Record<Status, Task[]> }>(`/kanban${areaId ? `?area_id=${areaId}` : ''}`).then((r) => r.columns);

export const fetchSummary = (): Promise<Record<'today' | 'upcoming' | 'overdue', number>> => tasksJson('/summary');

export const createTask = (body: TaskCreate): Promise<Task> => tasksJson('', { ...json(body), method: 'POST' });
export const updateTask = (id: string, body: TaskUpdate): Promise<Task> =>
  tasksJson(`/${id}`, { ...json(body), method: 'PATCH' });
export const setTaskStatus = (id: string, status: Status): Promise<Task> =>
  tasksJson(`/${id}/status`, json({ status }));
export const deleteTask = (id: string): Promise<void> => tasksJson(`/${id}`, { method: 'DELETE' });

// -- local date helpers ------------------------------------------------------
// The store keeps naive local dates/times. Never use toISOString() here: it
// converts to UTC and can shift a task to the wrong day.

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Combines a `YYYY-MM-DD` date and an optional `HH:MM` time into a `due` string. */
export function toDue(date: string, time: string): { due: string; all_day: boolean } {
  if (!time) return { due: date, all_day: true };
  return { due: `${date}T${time}`, all_day: false };
}
