interface SettingsFacts {
  tab: string;
  engine: 'ollama' | 'custom';
  conversations: number;
}

/** One sentence for the Settings header, depending on the tab. */
export function summarizeSettings({ tab, engine, conversations }: SettingsFacts): string {
  if (tab === 'your-data') return 'Your chats and voice history, kept only on this computer.';
  if (tab === 'about') return 'About Phibe, your personal AI assistant.';
  const where = engine === 'ollama' ? 'on Ollama' : 'on a custom engine';
  return `Phibe is running ${where}, with ${conversations} ${conversations === 1 ? 'conversation' : 'conversations'} stored on this computer.`;
}
