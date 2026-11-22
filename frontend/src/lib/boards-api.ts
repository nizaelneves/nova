import { apiFetch } from './api';

export type PropertyType = 'text' | 'number' | 'checkbox' | 'date' | 'select' | 'status' | 'tags';
export type ViewType = 'table' | 'kanban' | 'calendar' | 'files' | 'feed';

export interface Option { id: string; label: string; color: string; done?: boolean }
export interface Property { id: string; name: string; type: PropertyType; options: Option[] }
export type Value = string | number | boolean | string[] | null;

export type FilterOp = 'is' | 'is_not' | 'has' | 'has_not' | 'contains' | 'before' | 'after' | 'checked' | 'unchecked' | 'empty' | 'filled';
export interface Filter { prop: string; op: FilterOp; value?: string }
export interface ViewConfig { filters?: Filter[]; sort?: { prop: string; desc: boolean } | null; groupBy?: string | null; dateBy?: string | null }
export interface BoardView { id: string; name: string; type: ViewType; config: ViewConfig }

export interface Repeat { freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; weekdays?: number[]; until?: string; count?: number; prop?: string }
export interface Attachment { id: string; item_id: string; name: string; size: number; created_at: string }
export interface BoardFile extends Attachment { item_title: string }
export interface Activity { id: string; text: string; created_at: string }

export interface Item {
  id: string;
  board_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  values: Record<string, Value>;
  created_at: string;
  recurrence: Repeat | null;
}
export interface BoardSummary { id: string; workspace_id: string; name: string }
export interface Board extends BoardSummary { properties: Property[]; views: BoardView[]; items: Item[] }
export interface Comment { id: string; item_id: string; body: string; created_at: string }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await apiFetch(`/api/boards${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* not JSON */ }
    throw new Error(typeof detail === 'string' ? detail : `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchBoards = (workspaceId: string) =>
  call<{ boards: BoardSummary[] }>(`?workspace_id=${encodeURIComponent(workspaceId)}`).then((r) => r.boards);
export const createBoard = (workspace_id: string, name: string, import_tasks = false) =>
  call<BoardSummary>('', 'POST', { workspace_id, name, import_tasks });
export const renameBoard = (id: string, name: string) => call<BoardSummary>(`/${id}`, 'PATCH', { name });
export const deleteBoard = (id: string) => call<void>(`/${id}`, 'DELETE');
export const fetchBoard = (id: string) => call<Board>(`/${id}`);

export const createProperty = (board: string, name: string, type: PropertyType, options: Option[] = []) =>
  call<Property>(`/${board}/properties`, 'POST', { name, type, options });
export const updateProperty = (id: string, changes: { name?: string; options?: Option[] }) =>
  call<Property>(`/properties/${id}`, 'PATCH', changes);
export const deleteProperty = (id: string) => call<void>(`/properties/${id}`, 'DELETE');

export const createItem = (board: string, title: string, extra: { parent_id?: string; values?: Record<string, Value> } = {}) =>
  call<Item>(`/${board}/items`, 'POST', { title, ...extra });
export const updateItem = (id: string, changes: { title?: string; description?: string; values?: Record<string, Value>; recurrence?: Repeat | null }) =>
  call<Item>(`/items/${id}`, 'PATCH', changes);
export const deleteItem = (id: string) => call<void>(`/items/${id}`, 'DELETE');

export const fetchComments = (item: string) => call<{ comments: Comment[] }>(`/items/${item}/comments`).then((r) => r.comments);
export const addComment = (item: string, body: string) => call<Comment>(`/items/${item}/comments`, 'POST', { body });
export const deleteComment = (id: string) => call<void>(`/comments/${id}`, 'DELETE');

export const fetchFiles = (item: string) => call<{ files: Attachment[] }>(`/items/${item}/files`).then((r) => r.files);
export const uploadFile = async (item: string, file: File): Promise<Attachment> => {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`/api/boards/items/${item}/files`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(res.status === 413 ? 'Files can be at most 25 MB' : `Upload failed: ${res.status}`);
  return res.json();
};
export const deleteFile = (id: string) => call<void>(`/files/${id}`, 'DELETE');
/** Fetch with the app's auth headers, then hand the bytes to the browser as a download. */
export async function downloadFile(file: Attachment): Promise<void> {
  const res = await apiFetch(`/api/boards/files/${file.id}`);
  if (!res.ok) throw new Error('Could not download the file');
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
  URL.revokeObjectURL(url);
}
export const fetchActivity = (item: string) => call<{ activity: Activity[] }>(`/items/${item}/activity`).then((r) => r.activity);

export const createView = (board: string, name: string, type: ViewType, config: ViewConfig = {}) =>
  call<BoardView>(`/${board}/views`, 'POST', { name, type, config });
export const updateView = (id: string, changes: { name?: string; config?: ViewConfig }) =>
  call<BoardView>(`/views/${id}`, 'PATCH', changes);
export const deleteView = (id: string) => call<void>(`/views/${id}`, 'DELETE');

export const fetchBoardFiles = (board: string) => call<{ files: BoardFile[] }>(`/${board}/files`).then((r) => r.files);
