import { create } from 'zustand';
import { apiFetch } from './api';

/** Where a model download stands, built from the lines Ollama reports. */
export interface PullProgress {
  /** Bytes done and expected, summed over every layer seen so far. */
  completed: number;
  total: number;
  /** Per layer, so a layer reported twice is not counted twice. */
  layers: Record<string, { completed: number; total: number }>;
  /** What Ollama is doing now, in its own words. */
  status: string;
}

export const emptyProgress = (): PullProgress => ({ completed: 0, total: 0, layers: {}, status: '' });

/** Folds one Ollama line (`{status, digest, total, completed}`) into the progress. */
export function applyLine(p: PullProgress, line: { status?: string; digest?: string; total?: number; completed?: number }): PullProgress {
  const status = line.status ?? p.status;
  if (!line.digest || !line.total) return { ...p, status };
  const layers = { ...p.layers, [line.digest]: { total: line.total, completed: Math.min(line.total, line.completed ?? p.layers[line.digest]?.completed ?? 0) } };
  const all = Object.values(layers);
  return { layers, status, total: all.reduce((n, l) => n + l.total, 0), completed: all.reduce((n, l) => n + l.completed, 0) };
}

/** Whole percent done, never 100 until Ollama says it is finished. */
export const percentOf = (p: PullProgress): number => (p.total ? Math.min(99, Math.floor((100 * p.completed) / p.total)) : 0);

/** The words for the bar: what is happening right now. */
export function labelOf(p: PullProgress): string {
  if (/verif/i.test(p.status)) return 'Verifying…';
  if (/writing|success/i.test(p.status)) return 'Finishing…';
  return p.total ? 'Downloading…' : 'Preparing…';
}

export const sizeText = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0, Math.round(bytes / 1e6))} MB`);

export type PullResult = { result: 'done' } | { result: 'cancelled' } | { result: 'error'; message: string };

interface PullState {
  /** The model being downloaded, or null. One download at a time. */
  model: string | null;
  progress: PullProgress;
  /** Bytes per second, smoothed. */
  speed: number;
  start: (model: string) => Promise<PullResult>;
  cancel: () => void;
}

let controller: AbortController | null = null;

export const usePulls = create<PullState>((set, get) => ({
  model: null,
  progress: emptyProgress(),
  speed: 0,

  async start(model) {
    if (get().model) return { result: 'error', message: 'Another download is running.' };
    controller = new AbortController();
    set({ model, progress: emptyProgress(), speed: 0 });
    let last = { at: Date.now(), bytes: 0 };
    try {
      const res = await apiFetch('/v1/models/pull/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Failed to pull model: ${await res.text().catch(() => res.statusText)}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const line = JSON.parse(raw) as { error?: string; status?: string };
          if (line.error) throw new Error(line.error);
          if (line.status === 'success') finished = true;
          const progress = applyLine(get().progress, line);
          const now = Date.now();
          let { speed } = get();
          if (now - last.at >= 700) {
            const rate = ((progress.completed - last.bytes) * 1000) / (now - last.at);
            speed = speed ? speed * 0.6 + rate * 0.4 : rate;
            last = { at: now, bytes: progress.completed };
          }
          set({ progress, speed });
        }
      }
      if (!finished) throw new Error('The download stopped before it finished.');
      return { result: 'done' };
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return { result: 'cancelled' };
      return { result: 'error', message: err instanceof Error ? err.message : 'Download failed' };
    } finally {
      controller = null;
      set({ model: null, progress: emptyProgress(), speed: 0 });
    }
  },

  cancel() {
    controller?.abort();
  },
}));
