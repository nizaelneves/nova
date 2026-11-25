import { apiFetch, authHeaders, getBase } from './api';

export interface SwipeVideo { folder: string; name: string; title: string; size: number; modified: number; created?: number; type?: string; preview?: string; threads?: string[]; source?: string }
export interface SwipeFolder { name: string; count: number }
export interface SwipeLibrary { folders: SwipeFolder[]; items: SwipeVideo[]; /** Copies: the shelves of each type. */ byType?: Record<string, SwipeFolder[]> }
/** A kind of Swipe File: videos, audios, prompts, hunches (ideas), or a text type (E-mails, Copies, or one you made). */
export type SwipeKind = string;
export interface TextType { id: string; label: string }
export const TEXT_EXT = ['.pdf', '.md', '.txt'];
const NOTE_EXT = ['.md', '.txt'];
/** Documents Hunches and Prompts also take: Phibe reads their text and keeps it as a note. */
const DOC_EXT = ['.docx', '.pdf', '.html', '.htm', '.pptx'];

export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv'];
/** What each kind of swipe accepts, and how it is named in the interface. */
export const KINDS: Record<string, { ext: string[]; one: string; many: string }> = {
  videos: { ext: VIDEO_EXTENSIONS, one: 'Video', many: 'Videos' },
  audios: { ext: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.weba'], one: 'Audio', many: 'Audios' },
  prompts: { ext: [...NOTE_EXT, ...DOC_EXT], one: 'Prompt', many: 'Prompts' },
  ideas: { ext: [...NOTE_EXT, ...DOC_EXT], one: 'Hunch', many: 'Hunches' }, // the name is only here: change these two words to rename the screen
};
/** What a kind takes and how it is named; any other kind is a text type. */
export const kindInfo = (kind: SwipeKind) => KINDS[kind] ?? { ext: TEXT_EXT, one: 'Text', many: 'Texts' };
const LEGACY: Record<string, string> = { emails: 'E-Mails' };
export const typeLabel = (id: string) => LEGACY[id] ?? id;
export const renameType = (id: string, newName: string) =>
  json<TextType>('/v1/swipe/types', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, new_name: newName }) });
export const deleteType = (id: string) => json<{ moved: number }>(`/v1/swipe/types?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
export const orderTypes = (order: string[]) =>
  json<{ ok: boolean }>('/v1/swipe/types/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) });
export const renameSource = (oldName: string, newName: string) =>
  json<{ changed: number }>('/v1/swipe/sources', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old: oldName, new: newName }) });
export const listTypes = () => json<TextType[]>('/v1/swipe/types');
export const createType = (name: string) =>
  json<TextType>('/v1/swipe/types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind: 'texts' }) });

/** The address of a video file. The player and the thumbnails read it straight from Phibe, with seeking. */
export const fileUrl = (kind: SwipeKind, v: Pick<SwipeVideo, 'folder' | 'name'>) =>
  `${getBase()}/v1/swipe/${kind}/file?folder=${encodeURIComponent(v.folder)}&name=${encodeURIComponent(v.name)}`;
export const videoUrl = (v: Pick<SwipeVideo, 'folder' | 'name'>) => fileUrl('videos', v);

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json(); detail = typeof b.detail === 'string' ? b.detail : ''; } catch { /* not JSON */ }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Shelf choices: "New Shelf…" first, then Unclassified, then the shelves that exist. */
export const NEW_SHELF = '\u0000new';
export const shelfOptions = (names: string[]) => [
  { value: NEW_SHELF, label: 'New Shelf…' }, { value: 'Unclassified', label: 'Unclassified' },
  ...names.filter((n) => n !== 'Unclassified').map((n) => ({ value: n, label: n })),
];

export const listSwipe = (kind: SwipeKind) => json<SwipeLibrary>(`/v1/swipe/${kind}`);

export const createSwipeFolder = (name: string, kind: SwipeKind) =>
  json<{ name: string }>('/v1/swipe/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) });

/** Renames a file and/or moves it to another folder; returns where it ended up. */
export const updateSwipe = (kind: SwipeKind, item: SwipeVideo, change: { title: string; folder: string; threads?: string[]; source?: string }) =>
  json<{ folder: string; name: string }>(`/v1/swipe/${kind}/file`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: item.folder, name: item.name, title: change.title, new_folder: change.folder, threads: change.threads, source: change.source }),
  });

/** Sends a file to the Swipe File's trash folder (it is not deleted for good). */
export const trashSwipe = (kind: SwipeKind, item: Pick<SwipeVideo, 'folder' | 'name'>) =>
  json<{ ok: boolean }>(`/v1/swipe/${kind}/file?folder=${encodeURIComponent(item.folder)}&name=${encodeURIComponent(item.name)}`, { method: 'DELETE' });

export interface TrashItem { kind: SwipeKind; folder: string; name: string; title: string; size: number; deleted: number }
export const listTrash = () => json<{ items: TrashItem[] }>('/v1/swipe/trash').then((r) => r.items);
export const restoreTrashed = (t: TrashItem) =>
  json<{ folder: string; name: string }>('/v1/swipe/trash/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: t.kind, folder: t.folder, name: t.name }) });
export const purgeTrashed = (t: TrashItem) =>
  json<{ ok: boolean }>(`/v1/swipe/trash?kind=${t.kind}&folder=${encodeURIComponent(t.folder)}&name=${encodeURIComponent(t.name)}`, { method: 'DELETE' });

/** Saves a web page (an e-mail's web view) as a PDF in a folder (the server draws it in a browser). An empty folder is guessed from the link. */
export const saveLink = (kind: SwipeKind, url: string, folder: string, source = '') =>
  json<SwipeVideo>(`/v1/swipe/${encodeURIComponent(kind)}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, folder, source }) });

/** Sends one file into a folder, reporting progress (0 to 1) as it goes. */
export function uploadSwipe(kind: SwipeKind, folder: string, file: File, onProgress: (done: number) => void, source = '', threads: string[] = []): Promise<SwipeVideo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getBase()}/v1/swipe/${kind}?folder=${encodeURIComponent(folder)}${source ? `&source=${encodeURIComponent(source)}` : ''}${threads.length ? `&threads=${encodeURIComponent(JSON.stringify(threads))}` : ''}`);
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new Error('The upload was interrupted'));
    xhr.onload = () => {
      let body: { detail?: unknown } & Partial<SwipeVideo> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as SwipeVideo);
      else reject(new Error(typeof body.detail === 'string' ? body.detail : `Upload failed: ${xhr.status}`));
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

export const formatSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

/** The text of a copy or prompt file. */
export async function readText(kind: SwipeKind, v: Pick<SwipeVideo, 'folder' | 'name'>): Promise<string> {
  const res = await apiFetch(fileUrl(kind, v).replace(getBase(), ''));
  if (!res.ok) throw new Error(`Could not open it: ${res.status}`);
  return res.text();
}

/** Creates a copy or prompt, or overwrites `name` when given (a new title renames it). */
export const saveText = (kind: SwipeKind, folder: string, title: string, content: string, name = '', threads: string[] = [], source?: string) =>
  json<{ folder: string; name: string }>(`/v1/swipe/${kind}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder, title, content, name, threads, source }) });

/** A hunch file starts with its threads in a small header; this gives the threads and the text apart. */
export function splitThreads(raw: string): { threads: string[]; text: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw); // Windows saves the file with \r\n
  if (!m) return { threads: [], text: raw };
  const line = m[1].split(/\r?\n/).find((l) => l.startsWith('threads:'));
  let threads: string[] = [];
  try { if (line) threads = (JSON.parse(line.slice(8)) as unknown[]).map(String); } catch { /* a header that is not ours */ }
  return { threads, text: raw.slice(m[0].length) };
}

export const renameSwipeFolder = (kind: SwipeKind, name: string, newName: string) =>
  json<{ name: string }>('/v1/swipe/folders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, new_name: newName }) });

/** Whether a video starts by itself when opened (Settings). Off until the user turns it on. */
export const getAutoPlay = () => { try { return localStorage.getItem('phibe.video.autoplay') === '1'; } catch { return false; } };
export const setAutoPlay = (on: boolean) => { try { localStorage.setItem('phibe.video.autoplay', on ? '1' : '0'); } catch { /* the choice lasts until the page reloads */ } };
