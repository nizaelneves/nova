import type { RssFeed } from './connectors-api';

/** The addresses in a text, separated by commas or lines: the same address once, and "example.com" read as https. */
export const addressesIn = (text: string): string[] => [
  ...new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).map((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`))),
];

/** Whether a feed matches what is typed in the search box (its name or its address, ignoring case). */
export const feedMatches = (feed: Pick<RssFeed, 'name' | 'url'>, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || feed.name.toLowerCase().includes(q) || feed.url.toLowerCase().includes(q);
};
