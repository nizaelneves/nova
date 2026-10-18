/** Meeting notes of each project, kept on this device. */
export interface Meeting {
  id: string;
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  notes: string;
}

export type MeetingStore = Record<string, Meeting[]>;

const KEY = 'phibe-meetings';

export function loadMeetings(): MeetingStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMeetings(store: MeetingStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked: notes stay for this session */ }
}

/** A new, empty meeting for `today`, placed first. */
export function addMeeting(list: Meeting[], today: string): { list: Meeting[]; meeting: Meeting } {
  const meeting = { id: Math.random().toString(36).slice(2, 10), title: '', date: today, notes: '' };
  return { list: [meeting, ...list], meeting };
}

export const updateMeeting = (list: Meeting[], id: string, changes: Partial<Omit<Meeting, 'id'>>): Meeting[] =>
  list.map((m) => (m.id === id ? { ...m, ...changes } : m));

export const removeMeeting = (list: Meeting[], id: string): Meeting[] => list.filter((m) => m.id !== id);

/** Newest meeting first; same day keeps the order they were added in. */
export const sortMeetings = (list: Meeting[]): Meeting[] => [...list].sort((a, b) => b.date.localeCompare(a.date));
