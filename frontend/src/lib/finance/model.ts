/** Finance types and the small helpers the screens share. Amounts are integer cents.
 *  Every number that comes from adding things up (totals, balances, shares, card
 *  cycles) is worked out by the server; see `src/phibe/finances/calc.py`. */
import type { IconName } from '../../components/Icon';

export type TxKind = 'income' | 'expense' | 'savings' | 'transfer';
export type PayMethod = 'cash' | 'pix' | 'debit' | 'credit';

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  color: string;
  icon: IconName;
  parentId?: string | null;
}

export interface Account {
  id: string;
  name: string;
  icon?: IconName | null; // shown when no bank logo matches the name
  logoKey?: string | null;
  opening: number;
  balance: number;
}

/** A bank card. Debit spends from its account; credit spends from its own limit. */
export interface BankCard {
  id: string;
  accountId: string;
  name: string;
  mode: 'credit' | 'debit' | 'both';
  limit: number;
  dueDay: number;
  closeDaysBefore: number;
  used: number; // credit used in the current cycle
  cycle: { start: string; close: string; due: string };
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  color: string;
  saved: number;
  monthsLeft: number | null;
}

export interface Tx {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  categoryId: string; // '' for savings, transfers and deleted categories
  kind: TxKind;
  amount: number;
  accountId: string; // the account money leaves (transfer: from)
  toAccountId?: string | null; // transfer only
  method: PayMethod;
  cardId?: string | null; // debit and credit only
  goalId?: string | null; // savings only
}

export interface Range {
  from: string;
  to: string;
  preset: 'month' | '7d' | '15d' | '30d' | '3m' | 'custom';
}

export interface Totals { income: number; expenses: number; savings: number }

export interface Slice { id: string; name: string; color: string; value: number; pct: number }
export interface SeriesPoint { date: string; income: number; expenses: number; net: number }

/** Everything the Overview screen shows, worked out by the server for the chosen period. */
export interface Overview {
  totals: Totals;
  previous: Totals;
  deltas: { balance: number | null; income: number | null; expenses: number | null; savings: number | null };
  balance: number;
  breakdown: Slice[];
  series: SeriesPoint[];
}

export const EMPTY_OVERVIEW: Overview = {
  totals: { income: 0, expenses: 0, savings: 0 },
  previous: { income: 0, expenses: 0, savings: 0 },
  deltas: { balance: 0, income: 0, expenses: 0, savings: 0 },
  balance: 0,
  breakdown: [],
  series: [],
};

// -- Dates and periods ---------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export function presetRange(preset: Range['preset'], today = iso(new Date())): Range {
  const t = parse(today);
  if (preset === 'month') return { preset, from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: today };
  if (preset === '3m') return { preset, from: iso(new Date(t.getFullYear(), t.getMonth() - 2, 1)), to: today };
  const days = preset === '7d' ? 7 : preset === '15d' ? 15 : 30;
  return { preset: preset === 'custom' ? '30d' : preset, from: addDays(today, -(days - 1)), to: today };
}

export function rangeLabel(r: Range): string {
  const fmt = (s: string) => parse(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const names: Record<Range['preset'], string> = {
    month: 'This Month', '7d': 'Last 7 Days', '15d': 'Last 15 Days', '30d': 'Last 30 Days', '3m': 'Last 3 Months',
    custom: `${fmt(r.from)} – ${fmt(r.to)}`,
  };
  return names[r.preset];
}

/** The top-level category a (sub)category belongs to. */
export function rootOf(cats: Category[], id: string): Category | undefined {
  const c = cats.find((x) => x.id === id);
  return c?.parentId ? cats.find((x) => x.id === c.parentId) ?? c : c;
}

// -- Formatting and input ------------------------------------------------------------

export const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.234,56", "1,234.56" or "19.99" to cents; the last comma or dot is the decimal mark. */
export function parseCents(input: string): number | null {
  const s = input.trim().replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const sep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const whole = (sep < 0 ? s : s.slice(0, sep)).replace(/[.,]/g, '');
  const frac = sep < 0 ? '' : s.slice(sep + 1);
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

/** One or two plain sentences about how the user is doing in the selected period. */
export function summarize(o: Overview): string {
  const { totals: t, deltas, balance } = o;
  if (t.income === 0 && t.expenses === 0) return 'No activity in this period yet. Add an income or expense to get started.';
  const net = t.income - t.expenses;
  const first = net >= 0 ? `You're ${money(net)} ahead this period.` : `You're ${money(-net)} over what came in this period.`;
  const d = deltas.expenses;
  const second = d === null || d === 0
    ? `Balance across accounts: ${money(balance)}.`
    : `Spending is ${Math.abs(d)}% ${d > 0 ? 'higher' : 'lower'} than last month.`;
  return `${first} ${second}`;
}
