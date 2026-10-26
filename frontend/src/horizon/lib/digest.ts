/** The quick digest as the server sends it (`GET /api/quick-digest`). */
export interface RawDigest {
  text?: string;
  sections?: Record<string, string>;
  sources_used?: string[];
  generated_at?: string;
  model_used?: string;
  items?: RawBlock[];
}

/** One item as the server sends it: where it came from, a headline, a line, the text and a link. */
export interface RawBlock {
  source: string;
  source_name?: string;
  kind?: string;
  title?: string;
  summary?: string;
  text?: string;
  url?: string;
  time?: string;
  origin?: string; // the feed or channel inside the source
}

export interface DigestItem { id: string; title: string; text: string }

export type BlockKind = 'news' | 'rss' | 'mail' | 'other';

/** A small block of the digest: one news item, one newsletter, one message. */
export interface DigestBlock {
  id: string;
  source: string;
  sourceName: string;
  kind: BlockKind;
  title: string;
  summary: string;
  text: string;
  url: string;
  time: Date | null;
  origin: string;
}

export interface Digest {
  /** The items as small blocks, newest source first. Empty for digests written before blocks existed. */
  blocks: DigestBlock[];
  /** How many new items were read, over all sources. */
  count: number;
  /** The first line, as a title for the day. */
  headline: string;
  /** What follows the headline, short. */
  summary: string;
  items: DigestItem[];
  sources: string[];
  generatedAt: Date;
  model: string;
}

/** Plain words out of a line of markdown. */
const plain = (line: string): string => line.replace(/^\s*(?:[#>*\-•]+|\d+[.)])\s*/, '').replace(/[*_`]+/g, '').trim();

const KNOWN: Record<string, string> = {
  news_rss: 'RSS', gmail: 'Gmail', gmail_imap: 'Gmail', gcalendar: 'Google Calendar',
  apple_calendar: 'Apple Calendar',
  github_notifications: 'GitHub Notifications', imessage: 'iMessage', whatsapp: 'WhatsApp', anytype: 'Anytype',
  slack: 'Slack', notion: 'Notion', outlook: 'Outlook', weather: 'Weather',
};

/** A source as the user knows it: "news_rss" is "RSS", "gmail" is "Gmail". */
export const sourceName = (key: string): string => KNOWN[key.toLowerCase()] ?? humanize(key);

/** "morning_news" becomes "Morning News". */
export const humanize = (key: string): string => key.replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

const short = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const initials = (title: string): string => title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';

/** "5 new items from 1 source" becomes "5 New Items From 1 Source"; any other headline is left alone. */
export function titleHeadline(line: string): string {
  const m = /^(\d+) new items? from (\d+) sources?$/i.exec(line.trim());
  if (!m) return line;
  const [items, sources] = [Number(m[1]), Number(m[2])];
  return `${items} New ${items === 1 ? 'Item' : 'Items'} From ${sources} ${sources === 1 ? 'Source' : 'Sources'}`;
}

export function parseDigest(raw: RawDigest): Digest {
  const lines = (raw.text ?? '').split('\n').map(plain).filter(Boolean);
  const sections = Object.entries(raw.sections ?? {}).filter(([, text]) => text && text.trim());
  const items: DigestItem[] = sections.length
    ? sections.map(([key, text]) => ({ id: key, title: sourceName(key), text: text.trim().replace(/^#+\s*/gm, '') }))
    : (raw.text ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(1).map((text, i) => ({ id: `p${i}`, title: `Highlight ${i + 1}`, text: text.replace(/^#+\s*/gm, '') }));
  if (!items.length && lines.length > 1) items.push({ id: 'summary', title: 'Summary', text: lines.slice(1).join(' ') });
  const counted = /^(\d+) new items?/i.exec(lines[0] ?? '');
  const kinds = ['news', 'rss', 'mail'];
  const blocks: DigestBlock[] = (raw.items ?? []).map((b, i) => ({
    id: `${b.source}-${i}`,
    source: b.source,
    sourceName: b.source_name || sourceName(b.source),
    kind: (kinds.includes(b.kind ?? '') ? b.kind : 'other') as BlockKind,
    title: (b.title ?? '').trim(),
    summary: (b.summary ?? '').trim(),
    text: (b.text ?? '').trim(),
    url: b.url ?? '',
    origin: (b.origin ?? '').trim(),
    time: b.time && !Number.isNaN(Date.parse(b.time)) ? new Date(b.time) : null,
  }));
  return {
    blocks,
    count: counted ? Number(counted[1]) : items.length,
    headline: titleHeadline(short(lines[0] ?? 'Your digest', 90)),
    summary: short(lines.slice(1).join(' '), 150),
    items,
    sources: (raw.sources_used ?? []).map(sourceName),
    generatedAt: raw.generated_at ? new Date(raw.generated_at) : new Date(0),
    model: raw.model_used ?? '',
  };
}

/** "Today 14:05", "Yesterday 09:30" or "12 Oct 09:30". */
export function timeLabel(date: Date, now: Date): string {
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  if (diff === 0) return `Today ${hhmm}`;
  if (diff === 1) return `Yesterday ${hhmm}`;
  return `${date.getDate()} ${date.toLocaleString('en', { month: 'short' })} ${hhmm}`;
}

/** How many blocks of each kind, to label the filters; only the kinds that exist are listed. */
export function kindCounts(blocks: DigestBlock[]): { kind: BlockKind; count: number }[] {
  const order: BlockKind[] = ['news', 'rss', 'mail'];
  return order.map((kind) => ({ kind, count: blocks.filter((b) => b.kind === kind).length })).filter((k) => k.count > 0);
}

/** "RSS" or, when the item says which feed it is from, "RSS · Sandeco". */
export const fromLabel = (b: Pick<DigestBlock, 'sourceName' | 'origin'>): string => (b.origin ? `${b.sourceName} · ${b.origin}` : b.sourceName);

export const kindLabel: Record<BlockKind, string> = { news: 'News', rss: 'RSS', mail: 'E-Mails', other: 'Other' };
