import { apiFetch } from '../api';
import type { Account, BankCard, Category, Goal, Overview, PayMethod, Range, Recurring, Tx } from './model';

/** An error from the finances API; `message` is the server's own explanation. */
class FinanceApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/finances${path}`, init);
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // Not JSON; keep the status text.
    }
    throw new FinanceApiError(typeof detail === 'string' ? detail : `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const send = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

interface FinanceState {
  accounts: Account[];
  cards: BankCard[];
  categories: Category[];
  goals: Goal[];
  recurring: Recurring[];
}

export const fetchState = () => call<FinanceState>('/state');

export const fetchOverview = (r: Range) =>
  call<Overview>(`/overview?from=${r.from}&to=${r.to}&preset=${r.preset}`);

export interface TxQuery { range: Range; kind?: Tx['kind'] | 'all' | 'card'; q?: string } // 'card': any transaction made with a card

export function fetchTransactions({ range, kind, q }: TxQuery) {
  const p = new URLSearchParams({ from: range.from, to: range.to });
  if (kind && kind !== 'all') p.set('kind', kind);
  if (q?.trim()) p.set('q', q.trim());
  return call<{ transactions: Tx[] }>(`/transactions?${p}`).then((r) => r.transactions);
}

export const fetchCategoryTotals = (kind: Category['kind'], r: Range) =>
  call<{ totals: Record<string, number> }>(`/category-totals?kind=${kind}&from=${r.from}&to=${r.to}`).then((x) => x.totals);

// Writes: a body with an `id` edits that item, one without creates a new one.
type Draft<T> = Omit<T, 'id'> & { id?: string };
const upsert = <T extends { id?: string }>(path: string, body: T) =>
  body.id ? call(`${path}/${body.id}`, send('PUT', body)) : call(`${path}`, send('POST', body));

export const saveAccount = (a: Draft<Pick<Account, 'id' | 'name' | 'icon' | 'opening'>>) => upsert('/accounts', a);
export const saveCard = (c: Draft<Omit<BankCard, 'used' | 'cycle'>>) => upsert('/cards', c);
export const saveCategory = (c: Draft<Category>) => upsert('/categories', c);
export const saveGoal = (g: Draft<Pick<Goal, 'id' | 'name' | 'target' | 'color'>>) => upsert('/goals', g);
export const saveTransaction = (t: Draft<Tx>) => upsert('/transactions', t);

export interface RecurringInput {
  date: string; description: string; categoryId: string; amount: number;
  accountId?: string; method: PayMethod; cardId?: string;
  installments: number | null; // null: every month until stopped
}
export const saveRecurring = (r: RecurringInput) => call('/recurring', send('POST', r));

export const remove = (kind: 'accounts' | 'cards' | 'categories' | 'goals' | 'transactions' | 'recurring', id: string) =>
  call<void>(`/${kind}/${id}`, { method: 'DELETE' });

export const importState = (data: Record<string, unknown>) => call<Record<string, number>>('/import', send('POST', data));
