import { apiFetch } from './api';
import { useAppStore } from './store';

// Keep replies short enough for the server limit (4000 chars) and for the
// listener: long answers are spoken up to a natural break.
const MAX_SPOKEN_CHARS = 1500;

// Live loudness of Nova's voice (0 to 1), read by the orb on every frame.
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let meter: Uint8Array | null = null;

export function getVoiceLevel(): number {
  if (!analyser || !meter) return 0;
  analyser.getByteTimeDomainData(meter as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (const v of meter) {
    const centred = (v - 128) / 128;
    sum += centred * centred;
  }
  return Math.min(1, Math.sqrt(sum / meter.length) * 3.2);
}

function listenTo(audio: HTMLAudioElement): void {
  try {
    audioContext = audioContext ?? new AudioContext();
    void audioContext.resume();
    const source = audioContext.createMediaElementSource(audio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    meter = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  } catch {
    // No analyser: the orb still reacts to "speaking", just not to loudness.
    analyser = null;
    meter = null;
  }
}

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
  useAppStore.getState().setSpeaking(false);
  analyser = null;
  meter = null;
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
  listenTo(audio);
  audio.onended = () => {
    if (current === audio) stopSpeaking();
  };
  await audio.play();
  useAppStore.getState().setSpeaking(true);
  return {
    backend: res.headers.get('X-Nova-Voice') ?? '',
    notice: res.headers.get('X-Nova-Voice-Notice') ?? '',
  };
}
