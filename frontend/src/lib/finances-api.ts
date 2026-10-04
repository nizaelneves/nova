import { apiFetch } from './api';

export type TxType = 'expense' | 'income' | 'transfer';
/** Every kind of row the ledger can hold. `invoice_payment` is created by paying
 * a card invoice — it never comes from `TransactionCreate`, only from the API. */
export type LedgerEntryType = TxType | 'invoice_payment';

export type LogoKey = 'santander' | 'santander_empresas' | 'c6' | 'caixa';

export interface Bank {
  id: string;
  name: string;
  logo_key: LogoKey | null;
  created_at: string;
  accounts: Account[];
}

/** The bank-nested balance holder (what used to be called a Wallet). */
export interface Account {
  id: string;
  bank_id: string;
  name: string;
  kind: 'bank' | 'savings';
  opening_cents: number;
  balance_cents: number;
}

/** A Card is fully independent — no Bank/Account link at all. */
export interface Card {
  id: string;
  name: string;
  logo_key: LogoKey | null;
  closing_day: number;
  due_day: number;
}

export interface Invoice {
  card_id: string;
  month: string;
  status: 'open' | 'closed' | 'paid';
  total_cents: number;
  closing_date: string;
  due_date: string;
  paid_at: string | null;
}

export interface InvoiceDetail extends Invoice {
  transactions: Transaction[];
}

export interface OverviewAccount extends Account {
  month: { income_cents: number; expense_cents: number; yield_cents: number; net_cents: number };
}

export interface OverviewBank extends Omit<Bank, 'accounts'> {
  accounts: OverviewAccount[];
}

export interface OverviewCard extends Card {
  current_invoice: Invoice;
}

export interface Overview {
  month: string;
  banks: OverviewBank[];
  cards: OverviewCard[];
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  children?: Category[];
}

export interface Transaction {
  id: string;
  type: LedgerEntryType;
  amount_cents: number;
  date: string;
  account_id: string | null;
  card_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  description: string;
  invoice_month: string | null;
  installment_no: number | null;
  installments_total: number | null;
}

export interface TransactionCreate {
  type: TxType;
  amount_cents: number;
  date: string;
  account_id?: string;
  card_id?: string;
  to_account_id?: string;
  category_id?: string;
  description?: string;
  installments?: number;
  invoice_month?: string;
}

export interface TransactionUpdate {
  description?: string;
  category_id?: string | null;
  amount_cents?: number;
  date?: string;
}

/** An error from the finances API. `detail` is the raw JSON body when it wasn't a plain string. */
export class FinancesApiError extends Error {
  detail: unknown;
  constructor(message: string, detail: unknown) {
    super(message);
    this.name = 'FinancesApiError';
    this.detail = detail;
  }
}

async function financesJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/finances${path}`, init);
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // Not JSON; keep the status text.
    }
    const message = typeof detail === 'string' ? detail : (detail as any)?.message || `Request failed: ${res.status}`;
    throw new FinancesApiError(message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const post = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchOverview = (month?: string): Promise<Overview> =>
  financesJson(`/overview${month ? `?month=${month}` : ''}`);

// -- banks ----------------------------------------------------------------------

export const fetchBanks = (): Promise<Bank[]> =>
  financesJson<{ banks: Bank[] }>('/banks').then((r) => r.banks);
export const createBank = (name: string, firstAccountName?: string): Promise<Bank> =>
  financesJson('/banks', post({ name, first_account_name: firstAccountName }));
export const renameBank = (id: string, name: string): Promise<Bank> =>
  financesJson(`/banks/${id}`, post({ name }, 'PATCH'));
export const deleteBank = (id: string): Promise<void> =>
  financesJson(`/banks/${id}`, { method: 'DELETE' });

// -- accounts (bank-nested balances) ---------------------------------------------

export const fetchAccounts = (bankId?: string): Promise<Account[]> =>
  financesJson<{ accounts: Account[] }>(`/accounts${bankId ? `?bank_id=${bankId}` : ''}`).then((r) => r.accounts);
export const createAccount = (
  bankId: string,
  name: string,
  kind: 'bank' | 'savings' = 'bank',
  openingCents = 0,
): Promise<Account> =>
  financesJson('/accounts', post({ bank_id: bankId, name, kind, opening_cents: openingCents }));
export const updateAccount = (id: string, changes: { name?: string; opening_cents?: number }): Promise<Account> =>
  financesJson(`/accounts/${id}`, post(changes, 'PATCH'));
export const deleteAccount = (id: string): Promise<void> =>
  financesJson(`/accounts/${id}`, { method: 'DELETE' });

export const fetchYieldHistory = (accountId: string) =>
  financesJson<{ history: unknown[] }>(`/accounts/${accountId}/yield`).then((r) => r.history);
export const recordYield = (accountId: string, month: string, amountCents: number) =>
  financesJson(`/accounts/${accountId}/yield`, post({ month, amount_cents: amountCents }, 'PUT'));

// -- categories -------------------------------------------------------------------

export const fetchCategories = (): Promise<Category[]> =>
  financesJson<{ categories: Category[] }>('/categories').then((r) => r.categories);
export const createCategory = (name: string, parentId?: string): Promise<Category> =>
  financesJson('/categories', post({ name, parent_id: parentId }));
export const renameCategory = (id: string, name: string): Promise<Category> =>
  financesJson(`/categories/${id}`, post({ name }, 'PATCH'));
export const deleteCategory = (id: string, moveTo?: string): Promise<void> =>
  financesJson(`/categories/${id}${moveTo ? `?move_to=${encodeURIComponent(moveTo)}` : ''}`, { method: 'DELETE' });

// -- cards (independent) ------------------------------------------------------------

export const fetchCards = (): Promise<Card[]> =>
  financesJson<{ cards: Card[] }>('/cards').then((r) => r.cards);
export const createCard = (name: string, closingDay: number, dueDay: number): Promise<Card> =>
  financesJson('/cards', post({ name, closing_day: closingDay, due_day: dueDay }));
export const updateCard = (id: string, changes: { name?: string; closing_day?: number; due_day?: number }): Promise<Card> =>
  financesJson(`/cards/${id}`, post(changes, 'PATCH'));
export const deleteCard = (id: string): Promise<void> => financesJson(`/cards/${id}`, { method: 'DELETE' });

export const fetchInvoices = (cardId: string): Promise<Invoice[]> =>
  financesJson<{ invoices: Invoice[] }>(`/cards/${cardId}/invoices`).then((r) => r.invoices);
export const fetchInvoice = (cardId: string, month: string): Promise<InvoiceDetail> =>
  financesJson(`/cards/${cardId}/invoices/${month}`);
export const payInvoice = (cardId: string, month: string, accountId: string, paidOn?: string): Promise<InvoiceDetail> =>
  financesJson(`/cards/${cardId}/invoices/${month}/pay`, post({ account_id: accountId, paid_on: paidOn }));
export const unpayInvoice = (cardId: string, month: string): Promise<InvoiceDetail> =>
  financesJson(`/cards/${cardId}/invoices/${month}/unpay`, post({}));

// -- transactions -------------------------------------------------------------------

export const fetchTransactions = (
  params: { accountId?: string; limit?: number; start?: string; end?: string } = {},
): Promise<Transaction[]> => {
  const q = new URLSearchParams();
  if (params.accountId) q.set('account_id', params.accountId);
  if (params.start) q.set('start', params.start);
  if (params.end) q.set('end', params.end);
  q.set('limit', String(params.limit ?? 500));
  return financesJson<{ transactions: Transaction[] }>(`/transactions?${q}`).then((r) => r.transactions);
};
export const createTransaction = (body: TransactionCreate): Promise<Transaction[]> =>
  financesJson<{ transactions: Transaction[] }>('/transactions', post(body)).then((r) => r.transactions);
export const updateTransaction = (id: string, body: TransactionUpdate): Promise<Transaction> =>
  financesJson(`/transactions/${id}`, post(body, 'PATCH'));
export const deleteTransaction = (id: string): Promise<void> =>
  financesJson(`/transactions/${id}`, { method: 'DELETE' });

/** Categories with their subcategories, as one flat list (children indented). */
export function flattenCategories(categories: Category[]): Array<Category & { indent: boolean }> {
  const out: Array<Category & { indent: boolean }> = [];
  for (const c of categories) {
    out.push({ ...c, indent: false });
    for (const child of c.children ?? []) out.push({ ...child, indent: true });
  }
  return out;
}

// -- reports ------------------------------------------------------------------

export interface PeriodTotals {
  income_cents: number;
  expense_cents: number;
  yield_cents: number;
  net_cents: number;
}

export interface MonthTotals extends PeriodTotals {
  month: string;
}

export interface YearTotals extends PeriodTotals {
  year: number;
}

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  total_cents: number;
  share_pct?: number;
  children: { category_id: string; name: string; total_cents: number }[];
}

export const fetchMonthlyReport = (year: number): Promise<MonthTotals[]> =>
  financesJson<{ series: MonthTotals[] }>(`/reports/monthly?year=${year}`).then((r) => r.series);

export const fetchYearlyReport = (): Promise<YearTotals[]> =>
  financesJson<{ series: YearTotals[] }>('/reports/yearly').then((r) => r.series);

export const fetchCategoryReport = (
  year: number,
  type: 'expense' | 'income',
  month?: string,
): Promise<{ total_cents: number; categories: CategoryTotal[] }> => {
  const q = new URLSearchParams({ year: String(year), type });
  if (month) q.set('month', month);
  return financesJson(`/reports/categories?${q}`);
};

// -- money helpers ------------------------------------------------------------

/** Parses a typed amount ("19,90", "19.90", "1.234,56") into integer centavos. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  // Whichever of ',' or '.' appears last is the decimal separator; strip the other as a thousands mark.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** `YYYY-MM` for the current month, or shifted by `delta` months. */
export function monthString(delta = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** `month` (`YYYY-MM`) shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive `[start, end]` date range (`YYYY-MM-DD`) covering `month`. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(y, m, 0).getDate();
  return { start, end: `${month}-${String(end).padStart(2, '0')}` };
}
