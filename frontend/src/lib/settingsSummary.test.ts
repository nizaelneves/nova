import { describe, expect, it } from 'vitest';
import { summarizeSettings } from './settingsSummary';

describe('settings summary', () => {
  it('describes the engine and the stored conversations on General', () => {
    expect(summarizeSettings({ tab: 'general', engine: 'ollama', conversations: 12 })).toBe('Phibe is running on Ollama, with 12 conversations stored on this computer.');
    expect(summarizeSettings({ tab: 'general', engine: 'custom', conversations: 1 })).toBe('Phibe is running on a custom engine, with 1 conversation stored on this computer.');
  });

  it('has a line for each of the other tabs', () => {
    for (const tab of ['your-data', 'about']) {
      expect(summarizeSettings({ tab, engine: 'ollama', conversations: 0 }).length).toBeGreaterThan(10);
    }
  });
});
