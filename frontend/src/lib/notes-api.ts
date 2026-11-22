import { apiFetch } from './api';
import type { GraphEdge, GraphNode } from './graphLayout';

export interface NoteSummary {
  id: string;
  kind: 'page' | 'bookmark';
  title: string;
  url: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  tags: string[];
  linked_from?: { id: string; title: string }[];
  linked_to?: { id: string; title: string }[]; // the notes it points at (a bookmark's backlinks are mostly these)
}

export interface Note extends NoteSummary {
  body: string;
  description: string;
  lang: string;
  local_edit: number;
  collections: { id: string; name: string }[];
  links: { id: string; kind: string }[];
  backlinks: { id: string; kind: string }[];
}

export interface TagCount { name: string; kind: string; count: number; color?: string }
export interface CollectionCount { id: string; name: string; count: number }
export interface SearchHit { id: string; title: string; snippet: string; score: number }

export interface Attachment { tags?: string[]; size?: number; name: string; url: string; ext: string; label: string; image: boolean; notes: { id: string; title: string }[] }

export interface RelatedNote { id: string; title: string; kind: string; score: number; shared: string[] }

export interface Job {
  state: 'idle' | 'running' | 'done' | 'error';
  done: number;
  total: number;
  result: Record<string, unknown> | null;
  error: string | null;
}
export interface NotesStatus {
  notes: number; pages: number; bookmarks: number; trashed: number; tags: number; collections: number;
  links: number; indexed: number; pending: number; embedding_model: string;
  index: Job;
  backups: { name: string; size: number; created: number }[];
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json(); detail = typeof b.detail === 'string' ? b.detail : ''; } catch { /* not JSON */ }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

export interface ListFilter { tag?: string; collection?: string; kind?: string; trashed?: boolean }

export const listNotes = (f: ListFilter = {}): Promise<NoteSummary[]> => {
  const q = new URLSearchParams();
  if (f.tag) q.set('tag', f.tag);
  if (f.collection) q.set('collection', f.collection);
  if (f.kind) q.set('kind', f.kind);
  if (f.trashed) q.set('trashed', 'true');
  return json(`/v1/notes?${q}`);
};
export const relatedNotes = (id: string): Promise<RelatedNote[]> => json(`/v1/notes/${id}/related?limit=6`);
export const notesGraph = (): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => json('/v1/notes/graph');
export const getNote = (id: string): Promise<Note> => json(`/v1/notes/${id}`);
export const searchNotes = (q: string): Promise<SearchHit[]> => json(`/v1/notes/search?${new URLSearchParams({ q, limit: '30' })}`);
export const listTags = (): Promise<TagCount[]> => json('/v1/notes/tags');
export const listCollections = (): Promise<CollectionCount[]> => json('/v1/notes/collections');
export const listAttachments = (): Promise<Attachment[]> =>
  json<Omit<Attachment, 'url'>[]>('/v1/notes/attachments').then((rows) => rows.map((a) => ({ ...a, url: `/v1/notes/files/${a.name}` })));
export const notesStatus = (): Promise<NotesStatus> => json('/v1/notes/status');
export const reindexNotes = (all = false): Promise<Job> => json('/v1/notes/reindex', { ...post, body: JSON.stringify({ all }) });

const patch = { method: 'PATCH', headers: { 'Content-Type': 'application/json' } };
export interface NoteDraft { title?: string; body?: string; url?: string; description?: string; tags?: string[] }

export const createNote = (body: { title: string; body?: string; kind?: 'page' | 'bookmark'; tags?: string[] }): Promise<Note> =>
  json('/v1/notes', { ...post, body: JSON.stringify(body) });
export const patchNote = (id: string, draft: NoteDraft): Promise<Note> => json(`/v1/notes/${id}`, { ...patch, body: JSON.stringify(draft) });
export const trashNote = (id: string): Promise<unknown> => json(`/v1/notes/${id}/trash`, post);
export const restoreNote = (id: string): Promise<unknown> => json(`/v1/notes/${id}/restore`, post);
export const createCollection = (name: string): Promise<{ id: string; name: string }> =>
  json('/v1/notes/collections', { ...post, body: JSON.stringify({ name }) });
export const renameCollection = (id: string, name: string): Promise<{ id: string; name: string }> =>
  json(`/v1/notes/collections/${id}`, { ...patch, body: JSON.stringify({ name }) });
export const deleteCollection = (id: string): Promise<unknown> => json(`/v1/notes/collections/${id}`, { method: 'DELETE' });
export const createBookmark = (url: string): Promise<Note> => json('/v1/notes/bookmark', { ...post, body: JSON.stringify({ url }) });
export const deleteNoteFile = (name: string): Promise<unknown> => json(`/v1/notes/files/${name}`, { method: 'DELETE' });
export const setFileTags = (name: string, tags: string[]): Promise<unknown> =>
  json(`/v1/notes/files/${name}/tags`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) });
export const setFileNotes = (name: string, notes: string[]): Promise<unknown> =>
  json(`/v1/notes/files/${name}/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
export const unlinkNotes = (src: string, dst: string): Promise<unknown> =>
  json(`/v1/notes/links?src=${src}&dst=${dst}`, { method: 'DELETE' });
export const createTag = (name: string): Promise<unknown> => json('/v1/notes/tags', { ...post, body: JSON.stringify({ name }) });
export const editTag = (name: string, change: { new_name?: string; color?: string }): Promise<unknown> =>
  json('/v1/notes/tags', { ...patch, body: JSON.stringify({ name, ...change }) });
export const deleteTag = (name: string): Promise<unknown> => json(`/v1/notes/tags?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
export const setNoteCollections = (id: string, ids: string[]): Promise<Note> =>
  json(`/v1/notes/${id}/collections`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });

/** Keeps a picture or file with the notes and returns the address to put in the text. */
export async function uploadNoteFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch('/v1/notes/files', { method: 'POST', body: form });
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json(); detail = typeof b.detail === 'string' ? b.detail : ''; } catch { /* not JSON */ }
    throw new Error(detail || `Upload failed: ${res.status}`);
  }
  return ((await res.json()) as { url: string }).url;
}

export interface BackupInfo { name: string; size: number; created: number }
export const backUpNow = (): Promise<BackupInfo & { notes: number; files: number }> => json('/v1/notes/backup', post);

/** Every note as Markdown plus pictures and files, saved from the browser as one ZIP. */
export async function downloadExport(): Promise<void> {
  const res = await apiFetch('/v1/notes/export');
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `phibe-notes-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
