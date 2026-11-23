import { isTauri } from './api';

export interface VoiceData { shortcut: string; silence_secs: number; countdown_secs: number; custom_words: string[]; mic: string | null }

const KEY = 'phibe-voice-settings';
const DEFAULTS: VoiceData = { shortcut: 'Ctrl+Alt+P', silence_secs: 7, countdown_secs: 5, custom_words: [], mic: null };

/** The timing of the voice card, the same settings Phibe's own Settings page edits. In the browser they are only remembered here; the desktop app keeps them for the global shortcut. */
export async function loadVoiceSettings(): Promise<VoiceData> {
  if (!isTauri()) {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; }
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<VoiceData>('voice_settings_get');
}

export async function saveVoiceSettings(next: VoiceData): Promise<VoiceData> {
  if (!isTauri()) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept until the page closes */ }
    return next;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<VoiceData>('voice_settings_set', { next });
}
