import { useEffect, useState } from 'react';
import {
  DateRangePicker, ExpenseBubbles, GoalsProgress, IncomeVsExpenses,
  StatCard, TabIcons, TerminalLine, TransactionsTable, type Tab,
} from '../components/finances/parts';
import { AccountsTab, CategoriesTab, GoalsTab, TransactionsTab } from '../components/finances/tabs';
import { TransactionForm } from '../components/finances/forms';
import { type Range, type TxKind, presetRange, summarize } from '../lib/finance/model';
import { useFinance, useOverview, useTransactions } from '../lib/finance/store';

export function FinancesPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [range, setRange] = useState<Range>(() => presetRange('month'));
  const [kind, setKind] = useState<TxKind | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const { categories, goals, load } = useFinance();
  const overview = useOverview(range);
  const recent = useTransactions({ range }).slice(0, 5);
  const { totals, deltas } = overview;
  const open = (t: Tab, k: TxKind | 'all' = 'all') => { setKind(k); setTab(t); };

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="fin-root h-full overflow-y-auto">
      <div className="fin-wrap">
        <header className="fin-header">
          <TerminalLine text={summarize(overview)} />
          <div className="fin-controls">
            <TabIcons tab={tab} onChange={(t) => open(t)} onAdd={() => setAdding(true)} />
            <DateRangePicker range={range} onChange={setRange} />
          </div>
        </header>

        {tab === 'Overview' && (
          <>
            <section className="fin-stats">
              <StatCard label="Total Balance" icon="wallet" tone="cyan" value={overview.balance} delta={deltas.balance} />
              <StatCard label="Total Income" icon="arrow-down" tone="mint" value={totals.income} delta={deltas.income} />
              <StatCard label="Total Expenses" icon="arrow-up" tone="peach" value={totals.expenses} delta={deltas.expenses} lowerIsBetter />
              <StatCard label="Savings" icon="wallet-money" tone="violet" value={totals.savings} delta={deltas.savings} />
            </section>
            <div className="fin-grid">
              <div className="fin-col-wide"><IncomeVsExpenses series={overview.series} /></div>
              <ExpenseBubbles slices={overview.breakdown} onView={() => open('Transactions', 'expense')} />
              <div className="fin-col-wide">
                <TransactionsTable txs={recent} cats={categories} onViewAll={() => open('Transactions')} />
              </div>
              <GoalsProgress goals={goals} onViewAll={() => open('Goals')} />
            </div>
          </>
        )}

        {tab === 'Accounts' && <AccountsTab />}
        {tab === 'Goals' && <GoalsTab />}
        {tab === 'Transactions' && <TransactionsTab key={kind} range={range} initialKind={kind} />}
        {tab === 'Categories' && <CategoriesTab range={range} />}
      </div>
      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  );
}
