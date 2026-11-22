import { apiFetch } from './api';

/** Voice models for transcribing, with their download sizes (MB). */
export const SPEECH_SIZES: Record<string, number> = { tiny: 75, base: 145, small: 486, medium: 1530, 'large-v3': 3090 };
export interface SpeechModel { model: string; installed: boolean; downloading: boolean; size_mb: number; progress: number; error?: string | null; current?: boolean }

const json = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) { let d = ''; try { d = (await res.json()).detail; } catch { /* no body */ } throw new Error(d || `Request failed: ${res.status}`); }
  return res.json() as Promise<T>;
};

export const getSpeechModel = () => apiFetch('/v1/speech/model').then((r) => json<SpeechModel>(r));
export const listSpeechModels = () => apiFetch('/v1/speech/models').then((r) => json<SpeechModel[]>(r));
export const setSpeechModel = (model: string) =>
  apiFetch('/v1/speech/model', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }).then((r) => json<SpeechModel>(r));
export const downloadSpeechModel = () => apiFetch('/v1/speech/model/download', { method: 'POST' }).then((r) => json<SpeechModel>(r));

const SHAPER = 'memoir.shaper';
/** The model that puts a spoken hunch in shape; empty means the same one the Mentor uses. */
export const getShaper = (): string => { try { return localStorage.getItem(SHAPER) ?? ''; } catch { return ''; } };
export const setShaper = (id: string) => { try { localStorage.setItem(SHAPER, id); } catch { /* not remembered */ } };
