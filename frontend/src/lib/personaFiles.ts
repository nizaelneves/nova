import { apiFetch } from './api';

export type PersonaFile = 'soul' | 'user' | 'instructions';
export interface PersonaText { text: string; limit: number }
export interface PromptSection { name: string; source: string; chars: number; text: string }

/** At most *limit* characters of *text*, counted the way the server counts (one per character, not per UTF-16 unit). */
export const clip = (text: string, limit: number): string => {
  const chars = Array.from(text);
  return chars.length > limit ? chars.slice(0, limit).join('') : text;
};
export const countChars = (text: string): number => Array.from(text).length;

export async function getPersonaFiles(): Promise<Record<PersonaFile, PersonaText>> {
  const res = await apiFetch('/v1/persona-files');
  if (!res.ok) throw new Error(`Could not read the files: ${res.status}`);
  return res.json();
}

export async function savePersonaFile(file: PersonaFile, text: string): Promise<Record<PersonaFile, PersonaText>> {
  const res = await apiFetch('/v1/persona-files', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [file]: text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Could not save: ${res.status}`);
  }
  return res.json();
}

export async function getPromptPreview(): Promise<{ sections: PromptSection[]; chars: number }> {
  const res = await apiFetch('/v1/persona-files/preview');
  if (!res.ok) throw new Error(`Could not read the prompt: ${res.status}`);
  return res.json();
}

export type SourcesMode = 'auto' | 'always' | 'off';

export async function getSourcesMode(): Promise<SourcesMode> {
  const res = await apiFetch('/v1/chat-sources');
  if (!res.ok) throw new Error(`Could not read the setting: ${res.status}`);
  return (await res.json()).mode;
}

export async function setSourcesMode(mode: SourcesMode): Promise<SourcesMode> {
  const res = await apiFetch('/v1/chat-sources', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(`Could not save: ${res.status}`);
  return (await res.json()).mode;
}
