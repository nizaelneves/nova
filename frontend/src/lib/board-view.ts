import type { Filter, FilterOp, Item, Property, PropertyType, Value, ViewConfig } from './boards-api';

export const OPS: Record<PropertyType, { id: FilterOp; label: string }[]> = {
  status: [{ id: 'is', label: 'is' }, { id: 'is_not', label: 'is not' }],
  select: [{ id: 'is', label: 'is' }, { id: 'is_not', label: 'is not' }, { id: 'empty', label: 'is empty' }],
  tags: [{ id: 'has', label: 'has' }, { id: 'has_not', label: 'does not have' }, { id: 'empty', label: 'is empty' }],
  text: [{ id: 'contains', label: 'contains' }, { id: 'empty', label: 'is empty' }, { id: 'filled', label: 'is filled' }],
  number: [{ id: 'is', label: '=' }, { id: 'before', label: '<' }, { id: 'after', label: '>' }],
  date: [{ id: 'before', label: 'before' }, { id: 'after', label: 'after' }, { id: 'is', label: 'on' }, { id: 'empty', label: 'is empty' }],
  checkbox: [{ id: 'checked', label: 'is checked' }, { id: 'unchecked', label: 'is unchecked' }],
};

const list = (v: Value | undefined): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [String(v)]);

function matches(item: Item, f: Filter, prop: Property): boolean {
  const v = item.values[f.prop];
  const want = f.value ?? '';
  switch (f.op) {
    case 'is': return prop.type === 'number' ? Number(v) === Number(want) : String(v ?? '') === want;
    case 'is_not': return String(v ?? '') !== want;
    case 'has': return list(v).includes(want);
    case 'has_not': return !list(v).includes(want);
    case 'contains': return String(v ?? '').toLowerCase().includes(want.toLowerCase());
    case 'before': return v != null && v !== '' && (prop.type === 'number' ? Number(v) < Number(want) : String(v) < want);
    case 'after': return v != null && v !== '' && (prop.type === 'number' ? Number(v) > Number(want) : String(v) > want);
    case 'checked': return v === true;
    case 'unchecked': return v !== true;
    case 'empty': return list(v).length === 0;
    case 'filled': return list(v).length > 0;
  }
}

export const needsValue = (op: FilterOp) => !['checked', 'unchecked', 'empty', 'filled'].includes(op);

/** Top-level items that pass the search and every finished filter, in the view's sort order. */
export function visibleItems(items: Item[], props: Property[], config: ViewConfig, query = ''): Item[] {
  const byId = new Map(props.map((p) => [p.id, p]));
  // A filter still waiting for its value does not hide anything.
  const filters = (config.filters ?? []).filter((f) => byId.has(f.prop) && (!needsValue(f.op) || f.value));
  const q = query.trim().toLowerCase();
  const kept = items.filter((i) => !i.parent_id
    && (!q || i.title.toLowerCase().includes(q))
    && filters.every((f) => matches(i, f, byId.get(f.prop)!)));
  const sort = config.sort ? byId.get(config.sort.prop) : undefined;
  if (!sort || !config.sort) return kept;
  const key = (i: Item): string | number => {
    const v = i.values[sort.id];
    if (sort.type === 'number') return Number(v ?? 0);
    if (sort.type === 'status' || sort.type === 'select') return sort.options.findIndex((o) => o.id === v);
    return String(v ?? '');
  };
  const dir = config.sort.desc ? -1 : 1;
  return [...kept].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}

export interface Group { key: string; label: string; color?: string; items: Item[] }

/** Split by a select/status property; items without a value go to "No value". Without a property there is one group. */
export function groupItems(items: Item[], props: Property[], groupBy: string | null | undefined): Group[] {
  const prop = props.find((p) => p.id === groupBy && (p.type === 'status' || p.type === 'select'));
  if (!prop) return [{ key: 'all', label: '', items }];
  const known = new Set(prop.options.map((o) => o.id));
  const groups: Group[] = prop.options.map((o) => ({ key: o.id, label: o.label, color: o.color, items: items.filter((i) => i.values[prop.id] === o.id) }));
  const rest = items.filter((i) => !known.has(String(i.values[prop.id])));
  return rest.length ? [...groups, { key: '', label: 'No value', items: rest }] : groups;
}

/** How many sub-items of *parent* sit in a "done" option of the first status property. */
export function subProgress(items: Item[], props: Property[], parent: string): { total: number; done: number } {
  const subs = items.filter((i) => i.parent_id === parent);
  const status = props.find((p) => p.type === 'status');
  const done = new Set(status?.options.filter((o) => o.done).map((o) => o.id));
  return { total: subs.length, done: subs.filter((i) => status && done.has(String(i.values[status.id]))).length };
}

/** The stage after *current* on the way to the first "done" option; null once there (cancelled-like stages are picked by hand). */
export function nextStage(prop: Property, current: Value | undefined): { id: string; label: string } | null {
  const lastIdx = prop.options.findIndex((o) => o.done);
  const end = lastIdx === -1 ? prop.options.length - 1 : lastIdx;
  const idx = prop.options.findIndex((o) => o.id === current);
  if (idx > end) return null;
  const next = prop.options[idx + 1];
  return idx + 1 <= end && next ? { id: next.id, label: next.label } : null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The six weeks (Sunday first) that cover *month* (0-based) of *year*, as YYYY-MM-DD strings. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  return Array.from({ length: 42 }, (_, n) => iso(new Date(year, month, 1 - first.getDay() + n)));
}

/** Items keyed by the date held in property *dateProp* (first 10 chars of the value). */
export function itemsByDate(items: Item[], dateProp: string | null | undefined): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const i of items) {
    const d = dateProp ? String(i.values[dateProp] ?? '').slice(0, 10) : '';
    if (d) out.set(d, [...(out.get(d) ?? []), i]);
  }
  return out;
}
