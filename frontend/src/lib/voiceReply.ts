import { apiFetch } from './api';

// Keep replies short enough for the server limit (4000 chars) and for the
// listener: long answers are spoken up to a natural break.
const MAX_SPOKEN_CHARS = 1500;

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let requestId = 0;

/** Turn a markdown reply into plain text that sounds natural when read aloud. */
export function cleanForSpeech(markdown: string): string {
  let text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (text.length > MAX_SPOKEN_CHARS) {
    const cut = text.slice(0, MAX_SPOKEN_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
    text = end > MAX_SPOKEN_CHARS / 2 ? cut.slice(0, end + 1) : cut;
  }
  return text;
}

/** Stop whatever Nova is saying right now (and cancel a request in flight). */
export function stopSpeaking(): void {
  requestId += 1;
  if (current) {
    current.pause();
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export interface SpeakResult {
  backend: string;
  notice: string;
}

/**
 * Ask the server for Nova's voice and play it. Resolves with which voice spoke
 * (`elevenlabs`, or `kokoro` when the reserve voice took over) and a notice
 * explaining a fallback. Rejects with a readable message if nothing could speak.
 */
export async function speakReply(markdown: string): Promise<SpeakResult | null> {
  const text = cleanForSpeech(markdown);
  if (!text) return null;
  stopSpeaking();
  const mine = requestId;

  const res = await apiFetch('/v1/speech/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : '';
    } catch {
      // Not JSON; use the status below.
    }
    throw new Error(detail || `Voice failed: ${res.status}`);
  }
  const blob = await res.blob();
  // A newer message (or a stop) arrived while the audio was being made.
  if (mine !== requestId) return null;

  currentUrl = URL.createObjectURL(blob);
  const audio = new Audio(currentUrl);
  current = audio;
  audio.onended = () => {
    if (current === audio) stopSpeaking();
  };
  await audio.play();
  return {
    backend: res.headers.get('X-Nova-Voice') ?? '',
    notice: res.headers.get('X-Nova-Voice-Notice') ?? '',
  };
}
