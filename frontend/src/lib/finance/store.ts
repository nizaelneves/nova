/** Finance data lives on the server. This store keeps the lists the screens need
 *  (accounts, cards, categories, goals) and a `version` that goes up after every
 *  change, so anything showing totals or transactions knows to ask again. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import * as api from './api';
import type { Account, BankCard, Category, Goal, Overview, Range, Tx } from './model';
import { EMPTY_OVERVIEW } from './model';

const LEGACY_KEY = 'phibe-finance'; // where finances were kept before the server held them

/** Turn what the browser saved into an import body, or null when there is nothing to move.
 *  The old "Other" categories no longer exist, so their transactions become uncategorized. */
export function legacyPayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw)?.state;
    if (!s || !Array.isArray(s.accounts)) return null;
    const dropped = new Set(['other', 'other-income']);
    return {
      accounts: s.accounts,
      cards: s.cards ?? [],
      goals: s.goals ?? [],
      categories: (s.categories ?? []).filter((c: Category) => !dropped.has(c.id)),
      transactions: (s.txs ?? []).map((t: Tx) => (dropped.has(t.categoryId) ? { ...t, categoryId: '' } : t)),
    };
  } catch {
    return null;
  }
}

interface FinanceState {
  accounts: Account[];
  cards: BankCard[];
  categories: Category[];
  goals: Goal[];
  loaded: boolean;
  version: number;
  load: () => Promise<void>;
  saveTx: (t: Parameters<typeof api.saveTransaction>[0]) => Promise<boolean>;
  deleteTx: (id: string) => Promise<boolean>;
  saveAccount: (a: Parameters<typeof api.saveAccount>[0]) => Promise<boolean>;
  deleteAccount: (id: string) => Promise<boolean>;
  saveCard: (c: Parameters<typeof api.saveCard>[0]) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  saveCategory: (c: Parameters<typeof api.saveCategory>[0]) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  saveGoal: (g: Parameters<typeof api.saveGoal>[0]) => Promise<boolean>;
  deleteGoal: (id: string) => Promise<boolean>;
}

export const useFinance = create<FinanceState>()((set, get) => {
  const refresh = async () => {
    const s = await api.fetchState();
    set({ ...s, loaded: true, version: get().version + 1 });
  };
  /** Run a change, then refresh. Failures are shown to the user and reported as `false`. */
  const act = async (change: () => Promise<unknown>) => {
    try {
      await change();
      await refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    }
  };
  return {
    accounts: [], cards: [], categories: [], goals: [], loaded: false, version: 0,
    load: async () => {
      try {
        await refresh();
        const { accounts, cards, goals } = get();
        const payload = accounts.length || cards.length || goals.length ? null : legacyPayload(localStorage.getItem(LEGACY_KEY));
        if (payload) {
          await api.importState(payload);
          localStorage.removeItem(LEGACY_KEY);
          await refresh();
          toast.success('Your finances were moved to the Phibe server');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not load finances');
        set({ loaded: true });
      }
    },
    saveTx: (t) => act(() => api.saveTransaction(t)),
    deleteTx: (id) => act(() => api.remove('transactions', id)),
    saveAccount: (a) => act(() => api.saveAccount(a)),
    deleteAccount: (id) => act(() => api.remove('accounts', id)),
    saveCard: (c) => act(() => api.saveCard(c)),
    deleteCard: (id) => act(() => api.remove('cards', id)),
    saveCategory: (c) => act(() => api.saveCategory(c)),
    deleteCategory: (id) => act(() => api.remove('categories', id)),
    saveGoal: (g) => act(() => api.saveGoal(g)),
    deleteGoal: (id) => act(() => api.remove('goals', id)),
  };
});

/** Fetch something that depends on the data; asks again after every change. */
function useServer<T>(fetcher: () => Promise<T>, deps: unknown[], initial: T): T {
  const version = useFinance((s) => s.version);
  const [data, setData] = useState<T>(initial);
  useEffect(() => {
    let current = true;
    fetcher().then((d) => current && setData(d)).catch(() => undefined);
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return data;
}

export const useOverview = (r: Range) =>
  useServer<Overview>(() => api.fetchOverview(r), [r.from, r.to, r.preset], EMPTY_OVERVIEW);

export const useTransactions = (q: api.TxQuery) =>
  useServer<Tx[]>(() => api.fetchTransactions(q), [q.range.from, q.range.to, q.kind, q.q], []);

export const useCategoryTotals = (kind: Category['kind'], r: Range) =>
  useServer<Record<string, number>>(() => api.fetchCategoryTotals(kind, r), [kind, r.from, r.to], {});
