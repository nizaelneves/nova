/**
 * What the user wants Phi to help them memorize. Only the choices live here;
 * when and how Phi brings them up (a ping, out loud, on command) is decided
 * elsewhere. Kept in this browser, like the other client-side settings.
 */

export const MEMORIZE_CATEGORIES = [
  { id: 'bible', label: 'Bible verses', description: 'Verses and passages you want to keep close' },
  { id: 'philosophy', label: 'Philosophy', description: 'Ideas, principles and ways of thinking' },
  { id: 'ideas', label: 'Ideas & insights', description: 'Your own thoughts worth not losing' },
  { id: 'concepts', label: 'Things I am studying', description: 'Concepts, definitions and facts to learn' },
  { id: 'quotes', label: 'Quotes', description: 'Words from people who inspire you' },
] as const;

export type MemorizeCategory = (typeof MEMORIZE_CATEGORIES)[number]['id'];

export interface MemorizeItem {
  id: string;
  category: MemorizeCategory;
  text: string;
  source: string;
  createdAt: string;
}

export interface MemorizeData {
  enabled: MemorizeCategory[];
  items: MemorizeItem[];
}

const STORAGE_KEY = 'phi-memorize';
const CATEGORY_IDS = new Set<string>(MEMORIZE_CATEGORIES.map((c) => c.id));

export const EMPTY_MEMORIZE: MemorizeData = { enabled: [], items: [] };

function isCategory(value: unknown): value is MemorizeCategory {
  return typeof value === 'string' && CATEGORY_IDS.has(value);
}

/** Reads stored data, dropping anything malformed instead of failing. */
export function parseMemorize(raw: string | null): MemorizeData {
  if (!raw) return { ...EMPTY_MEMORIZE };
  try {
    const data = JSON.parse(raw) as Partial<MemorizeData>;
    const enabled = Array.isArray(data.enabled) ? data.enabled.filter(isCategory) : [];
    const items = Array.isArray(data.items)
      ? data.items.filter(
          (i): i is MemorizeItem =>
            !!i && typeof i.id === 'string' && isCategory(i.category) && typeof i.text === 'string' && i.text.trim() !== '',
        )
      : [];
    return { enabled: [...new Set(enabled)], items };
  } catch {
    return { ...EMPTY_MEMORIZE };
  }
}

export function loadMemorize(): MemorizeData {
  try {
    return parseMemorize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_MEMORIZE };
  }
}

export function saveMemorize(data: MemorizeData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked or full: the choice just lasts until the page closes.
  }
}

export function toggleCategory(data: MemorizeData, id: MemorizeCategory): MemorizeData {
  const enabled = data.enabled.includes(id) ? data.enabled.filter((c) => c !== id) : [...data.enabled, id];
  return { ...data, enabled };
}

/** Adds an item to an enabled category; blank text or a disabled category adds nothing. */
export function addItem(
  data: MemorizeData,
  item: { category: MemorizeCategory; text: string; source?: string },
  now: Date = new Date(),
): MemorizeData {
  const text = item.text.trim();
  if (!text || !data.enabled.includes(item.category)) return data;
  const created: MemorizeItem = {
    id: `${now.getTime()}-${data.items.length}`,
    category: item.category,
    text,
    source: (item.source ?? '').trim(),
    createdAt: now.toISOString(),
  };
  return { ...data, items: [created, ...data.items] };
}

export function removeItem(data: MemorizeData, id: string): MemorizeData {
  return { ...data, items: data.items.filter((i) => i.id !== id) };
}
