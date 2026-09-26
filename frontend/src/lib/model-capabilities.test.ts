import { describe, expect, it } from 'vitest';

import { isEmbedOnlyModel, EFFORT_LEVELS, isCliModel, thinkSupport } from './model-capabilities';

describe('isEmbedOnlyModel', () => {
  it.each([
    'nomic-embed-text',
    'mxbai-embed-large',
    'text-embedding-3-small',
    'all-minilm:latest',
    'hf.co/BAAI/bge-m3:latest',
  ])('classifies %s as embedding-only', (modelId) => {
    expect(isEmbedOnlyModel(modelId)).toBe(true);
  });

  it.each(['qwen3.5:4b', 'codegemma:7b'])('keeps %s available for chat', (modelId) => {
    expect(isEmbedOnlyModel(modelId)).toBe(false);
  });
});

describe('Claude CLI models and Think support', () => {
  it('recognises the CLI models', () => {
    expect(['sonnet', 'opus', 'haiku', 'claude-sonnet-5'].every(isCliModel)).toBe(true);
    expect(isCliModel('qwen3.5:2b')).toBe(false);
  });

  it('rates Sonnet and Opus as the best for Think, Haiku as basic', () => {
    expect(thinkSupport('opus').level).toBe('strong');
    expect(thinkSupport('sonnet').level).toBe('strong');
    expect(thinkSupport('haiku').level).toBe('basic');
  });

  it('rates local models by size and family', () => {
    expect(thinkSupport('qwen3.5:2b').level).toBe('basic');
    expect(thinkSupport('qwen3.5:9b').level).toBe('good');
    expect(thinkSupport('qwen3.5:35b').level).toBe('strong');
    expect(thinkSupport('llama3.2:latest').level).toBe('none');
    expect(thinkSupport('some-unknown-model').level).toBe('unknown');
  });

  it('exposes the five effort levels in order', () => {
    expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
});
