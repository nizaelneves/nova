interface SourceCount {
  connected: boolean;
  chunks: number;
  /** The last sync of this source failed. */
  failing?: boolean;
}

/** One sentence on the sources, in the voice of the other screens. */
export function summarizeSources(sources: SourceCount[], tools?: { ready: number; total: number }): string {
  const on = sources.filter((s) => s.connected);
  const toolsNote = tools && tools.total > 0 ? ` ${tools.ready} of ${tools.total} tools are ready.` : '';
  if (on.length === 0) return `No sources connected yet. Turn one on to get started.${toolsNote}`;
  const items = on.reduce((n, s) => n + s.chunks, 0);
  const failing = on.filter((s) => s.failing).length;
  const head = `Connected ${on.length} of ${sources.length} sources, with ${items} ${items === 1 ? 'item' : 'items'} indexed.`;
  return `${failing ? `${head} ${failing} ${failing === 1 ? 'needs' : 'need'} attention.` : head}${toolsNote}`;
}
