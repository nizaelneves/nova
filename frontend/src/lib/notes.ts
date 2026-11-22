/** Small pure helpers for the Notes screen. */

/** Imported Markdown starts with the title as a heading; the screen already shows the title, so drop that one line. */
export function withoutTitle(body: string, title: string): string {
  const lines = body.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0 && lines[first].replace(/^#\s+/, '').trim() === title.trim() && /^#\s/.test(lines[first])) {
    return lines.slice(first + 1).join('\n').replace(/^\s+/, '');
  }
  return body;
}

/** Some imported notes write bold text as `**Word **next`; Markdown only bolds it when the stars touch the words. */
export function tidyMarkdown(text: string): string {
  return text.split('\n').map((line) => {
    const parts = line.split('**');
    if (parts.length < 3 || parts.length % 2 === 0) return line; // no pair, or an unmatched mark: leave it
    for (let k = 0; k < parts.length - 1; k++) {
      if (k % 2 === 0) { // opening marks: spaces after them go before them
        const lead = /^[ \t]+/.exec(parts[k + 1])?.[0] ?? '';
        parts[k] += lead; parts[k + 1] = parts[k + 1].slice(lead.length);
      } else { // closing marks: spaces before them go after them
        const trail = /[ \t]+$/.exec(parts[k])?.[0] ?? '';
        parts[k] = parts[k].slice(0, parts[k].length - trail.length); parts[k + 1] = trail + parts[k + 1];
      }
    }
    return parts.join('**');
  }).join('\n');
}

/** "Today", "Yesterday", "3 days ago", or a short date; `now` is injectable for tests. */
export function whenText(epochSeconds: number, now: Date = new Date()): string {
  const day = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
  const ago = day(now) - day(new Date(epochSeconds * 1000));
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return `${ago} Days Ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A search hit's snippet without the leading "# Title" and Markdown marks, cut to a short plain line. */
export function plainSnippet(snippet: string, title: string, max = 140): string {
  const text = withoutTitle(snippet, title).replace(/[#*_`>|]/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Where a Markdown link points inside Notes: `/notes?note=<id>` is a mention of another note. */
export function mentionedNoteId(href: string | undefined): string | null {
  return /^\/notes\?note=([0-9a-f]{32})$/.exec(href ?? '')?.[1] ?? null;
}
