/** Removes quote marks typed around a phrase; the screen adds the curly ones itself. */
export function cleanPhrase(text: string): string {
  return text.trim().replace(/^["“”«»]+/, '').replace(/["“”«»]+$/, '').trim();
}
