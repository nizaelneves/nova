/** Quick notes of each workspace, kept on this device, newest first. */
export interface Note { id: string; text: string; at: string }

export type NoteStore = Record<string, Note[]>;

const KEY = 'phibe-project-notes';
const MAX = 50;

export function loadNotes(): NoteStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNotes(store: NoteStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked: the notes stay for this session */ }
}

/** Puts a note first; an empty note changes nothing. Only the newest 50 are kept. */
export function addNote(list: Note[], text: string, now: Date): Note[] {
  const clean = text.trim();
  if (!clean) return list;
  return [{ id: Math.random().toString(36).slice(2, 10), text: clean, at: now.toISOString() }, ...list].slice(0, MAX);
}

export const removeNote = (list: Note[], id: string): Note[] => list.filter((n) => n.id !== id);
