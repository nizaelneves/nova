const EMBEDDING_MODEL_PREFIXES = [
  'all-minilm',
  'bge-',
  'bge_',
  'e5-',
  'e5_',
  'gte-',
  'gte_',
  'jina-embeddings',
  'nomic-bert',
  'sentence-transformers',
];

export function isEmbedOnlyModel(modelId: string): boolean {
  const name = (modelId || '').trim().toLowerCase();
  const leaf = name.slice(name.lastIndexOf('/') + 1).split(':')[0];
  return (
    leaf.includes('embed') ||
    leaf.includes('minilm') ||
    EMBEDDING_MODEL_PREFIXES.some((prefix) => leaf.startsWith(prefix))
  );
}

// ── Claude CLI models ───────────────────────────────────────────────────

/**
 * Models served by the Claude Code CLI (they accept a reasoning effort). Only
 * the short names count: "claude-sonnet-..." is the paid API, not the CLI.
 */
export function isCliModel(modelId: string): boolean {
  const name = (modelId || '').trim().toLowerCase();
  return name === 'sonnet' || name === 'opus' || name === 'haiku';
}

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

// ── How well a model can "Think" (reason step by step) ──────────────────

export type ThinkLevel = 'strong' | 'good' | 'basic' | 'none' | 'unknown';

export interface ThinkSupport {
  level: ThinkLevel;
  label: string;
  hint: string;
}

const LOCAL_REASONING_FAMILIES = ['qwen3', 'deepseek-r1', 'qwq', 'gpt-oss', 'magistral', 'phi4-reasoning'];

function localSizeB(name: string): number | null {
  const m = name.match(/[:\-_](\d+(?:\.\d+)?)b\b/);
  return m ? parseFloat(m[1]) : null;
}

/** A plain-language rating of a model for reasoning, shown next to the model. */
export function thinkSupport(modelId: string): ThinkSupport {
  const name = (modelId || '').trim().toLowerCase();
  if (isCliModel(name) || name.startsWith('claude-')) {
    if (name.includes('haiku')) {
      return { level: 'basic', label: 'Think: basic', hint: 'Fast Claude model, light reasoning.' };
    }
    return {
      level: 'strong',
      label: 'Think: best',
      hint: name.includes('opus')
        ? 'Strongest reasoning. Uses the most of your Claude plan.'
        : 'Strong reasoning. Raise the effort for harder problems.',
    };
  }
  if (LOCAL_REASONING_FAMILIES.some((family) => name.includes(family))) {
    const size = localSizeB(name);
    if (size !== null && size >= 27) {
      return { level: 'strong', label: 'Think: best', hint: 'Large local reasoning model.' };
    }
    if (size !== null && size >= 7) {
      return { level: 'good', label: 'Think: good', hint: 'Local reasoning model.' };
    }
    return {
      level: 'basic',
      label: 'Think: basic',
      hint: 'Small local model: it reasons, but makes mistakes in maths and logic. Prefer Sonnet or Opus for important work.',
    };
  }
  if (/^(llama|mistral|gemma|phi)/.test(name.slice(name.lastIndexOf('/') + 1))) {
    return { level: 'none', label: 'No reasoning', hint: 'This model has no reasoning mode. Think will not work well here.' };
  }
  return { level: 'unknown', label: '', hint: '' };
}
