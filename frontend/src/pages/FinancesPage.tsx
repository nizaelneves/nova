import { useEffect, useState } from 'react';
import {
  DateRangePicker, ExpenseBubbles, IncomeVsExpenses, SavingsProgress,
  StatCard, TabIcons, TransactionsTable, type Tab,
} from '../components/finances/parts';
import { TerminalLine } from '../components/TerminalLine';
import { AccountsTab, CardsTab, CategoriesTab, TransactionsTab } from '../components/finances/tabs';
import { TransactionForm } from '../components/finances/forms';
import { CardScreen } from '../components/finances/card-screen';
import { type Range, type TxKind, presetRange, summarize } from '../lib/finance/model';
import { useFinance, useOverview, useTransactions } from '../lib/finance/store';

export function FinancesPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [range, setRange] = useState<Range>(() => presetRange('month'));
  const [kind, setKind] = useState<TxKind | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [onlyAccount, setOnlyAccount] = useState<string | null>(null); // Transactions limited to one account
  const [cardSettings, setCardSettings] = useState(false); // open the card's screen with its settings showing // a card's own screen, shown inside Cards
  const { categories, accounts, load } = useFinance();
  const overview = useOverview(range);
  const recent = useTransactions({ range }).slice(0, 5);
  const { totals, deltas } = overview;
  const open = (t: Tab, k: TxKind | 'all' = 'all') => { setKind(k); setCardId(null); setCardSettings(false); setOnlyAccount(null); setTab(t); };

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
              <SavingsProgress accounts={accounts} onViewAll={() => open('Accounts')} />
            </div>
          </>
        )}

        {tab === 'Accounts' && <AccountsTab />}
        {tab === 'Cards' && (cardId ? <CardScreen cardId={cardId} startSettings={cardSettings} onBack={() => setCardId(null)} /> : <CardsTab onOpenCard={(c, settings) => { setCardSettings(!!settings); setCardId(c.id); }} />)}
        {tab === 'Transactions' && <TransactionsTab key={`${kind}-${onlyAccount}`} range={range} initialKind={kind} accountId={onlyAccount} onClearAccount={() => setOnlyAccount(null)} />}
        {tab === 'Categories' && <CategoriesTab range={range} />}
      </div>
      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  );
}
