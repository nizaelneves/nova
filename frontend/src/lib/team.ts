import { PROJECT_COLORS } from './projects';

/** Everyone you work with that you add by hand: people, and agents that Phibe does not list on its own. */
export interface Member {
  id: string;
  name: string;
  /** A job for a person, a kind of work for an agent. */
  role: string;
  kind: 'human' | 'agent';
  /** What they are working on now. */
  current: string;
}

export type TeamStore = Record<string, Member[]>;

const KEY = 'phibe-team';

export function loadTeam(): TeamStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTeam(store: TeamStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked: the team stays for this session */ }
}

/** Adds a member, or returns the list untouched when the name is empty or already there. */
export function addMember(list: Member[], name: string, role: string, kind: Member['kind'] = 'human'): Member[] {
  const clean = name.trim();
  if (!clean || list.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return list;
  return [...list, { id: Math.random().toString(36).slice(2, 10), name: clean, role: role.trim(), kind, current: '' }];
}

export const updateMember = (list: Member[], id: string, changes: Partial<Omit<Member, 'id'>>): Member[] =>
  list.map((m) => (m.id === id ? { ...m, ...changes } : m));

export const removeMember = (list: Member[], id: string): Member[] => list.filter((m) => m.id !== id);

/** The same colour for the same person every time. */
export function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

export const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
