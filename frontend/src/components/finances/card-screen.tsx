import { useEffect, useState } from 'react';
import { fetchUpcoming } from '../../lib/finance/api';
import { toast } from 'sonner';
import { Icon, type IconName } from '../Icon';
import { iso, money, parse, rootOf, type Tx } from '../../lib/finance/model';
import { useFinance, useTransactions } from '../../lib/finance/store';
import { CardFormBody, ConfirmDelete, DeleteTransaction, PayCardForm, TransactionForm } from './forms';
import { Heading, Mini, shortDate } from './tabs';

const MODE = { credit: 'Credit', debit: 'Debit', both: 'MultiFunction' } as const;
const firstOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * One whole screen for a bank card: its settings, a payment button and everything spent with it, a month at
 * a time (this month first, then back through the older ones), with a search and a filter.
 */
export function CardScreen({ cardId, onBack, startSettings = false }: { cardId: string; onBack: () => void; startSettings?: boolean }) {
  const { cards, accounts, categories, deleteCard, deleteTx, version } = useFinance();
  const card = cards.find((c) => c.id === cardId);
  const [month, setMonth] = useState(() => firstOf(new Date()));
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'expense' | 'payment'>('all');
  const [settings, setSettings] = useState(startSettings);
  const [modal, setModal] = useState<null | { t: 'pay' } | { t: 'edit'; tx: Tx } | { t: 'del'; tx: Tx } | { t: 'del-card' }>(null);

  const range = { from: iso(month), to: iso(new Date(month.getFullYear(), month.getMonth() + 1, 0)), preset: 'custom' as const };
  const [upcoming, setUpcoming] = useState<Tx[]>([]);
  useEffect(() => {
    let live = true;
    fetchUpcoming(range).then((l) => live && setUpcoming(l)).catch(() => live && setUpcoming([]));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, version]);
  const coming = kind === 'payment' ? [] : upcoming.filter((t) => t.cardId === cardId && t.description.toLowerCase().includes(q.trim().toLowerCase()));
  const rows = [
    ...coming,
    ...useTransactions({ range, kind: kind === 'all' ? 'card' : kind, q }).filter((t) => t.cardId === cardId),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (!card) return <p className="fin-empty">This card no longer exists.</p>;

  const credit = card.mode !== 'debit';
  const pct = credit && card.limit ? Math.min(100, Math.round((card.used / card.limit) * 100)) : 0;
  const sum = (f: (t: Tx) => boolean) => rows.filter(f).reduce((n, t) => n + t.amount, 0);
  const onCredit = sum((t) => t.kind === 'expense' && t.method === 'credit');
  const onDebit = sum((t) => t.kind === 'expense' && t.method !== 'credit'); // comes out of the account, never the limit
  const paid = rows.filter((t) => t.kind === 'payment').reduce((n, t) => n + t.amount, 0);
  const isNow = month.getTime() === firstOf(new Date()).getTime();
  const step = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const account = accounts.find((a) => a.id === card.accountId);

  const by = new Map<string, Tx[]>();
  for (const t of rows) by.set(t.date, [...(by.get(t.date) ?? []), t]);

  return (
    <>
      <Heading title={card.name} hint={`${MODE[card.mode]} · ${account?.name ?? ''}${credit ? ` · Closes ${shortDate(card.cycle.close)} · Due ${shortDate(card.cycle.due)}` : ''}`}>
        <button type="button" className="fin-btn-quiet" onClick={onBack}>‹ Back to Cards</button>
        {credit && <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'pay' })}><Icon name="wallet-money" size={15} />Pay</button>}
        <button type="button" className="fin-btn-quiet" aria-expanded={settings} onClick={() => setSettings(!settings)}><Icon name="lucide-file-pen" size={15} />Settings</button>
        <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'del-card' })}><Icon name="lucide-trash" size={15} />Delete</button>
      </Heading>

      {settings && (
        <div className="fin-card" style={{ marginBottom: 14 }}>
          <CardFormBody initial={card} onDone={() => setSettings(false)} onCancel={() => setSettings(false)} />
        </div>
      )}

      {credit && (
        <div className="fin-card" style={{ marginBottom: 14 }}>
          <div className="fin-bar"><span style={{ width: `${pct}%`, background: pct > 85 ? '#ff6b6b' : 'linear-gradient(90deg,#10c3d3,#20e7aa)' }} /></div>
          <p className="fin-hint" style={{ marginTop: 8 }}>{money(card.used)} of {money(card.limit)} used in the current invoice. Only credit counts here; debit comes out of the account.</p>
        </div>
      )}

      <div className="fin-toolbar">
        <label className="fin-search"><Icon name="magnifer" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this card" aria-label="Search this card" /></label>
        <div className="fin-filter" style={{ margin: 0 }}>
          {(['all', 'expense', 'payment'] as const).map((k) => (
            <button key={k} type="button" data-active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'expense' ? 'Expenses' : 'Payments'}</button>
          ))}
        </div>
        <div className="fin-filter" style={{ margin: 0, alignItems: 'center' }}>
          <button type="button" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
          <b style={{ minWidth: 130, textAlign: 'center', fontSize: '0.85rem' }}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
          <button type="button" aria-label="Next month" onClick={() => step(1)}>›</button>
          <button type="button" data-active={isNow} onClick={() => setMonth(firstOf(new Date()))}>This Month</button>
        </div>
      </div>

      <p className="fin-hint" style={{ marginBottom: 10 }}>{credit && `Credit ${money(onCredit)}`}{card.mode === 'both' ? ' · ' : ''}{card.mode !== 'credit' && `Debit ${money(onDebit)}`}{paid ? ` · Paid ${money(paid)}` : ''}</p>
      {by.size === 0 && <p className="fin-empty">Nothing on this card for this month and filter.</p>}
      <div className="fin-timeline">
        {[...by.entries()].map(([date, list]) => (
          <section key={date} className="fin-day">
            <header><b>{parse(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</b></header>
            {list.map((t) => {
              const cat = categories.find((c) => c.id === t.categoryId);
              const icon: IconName = t.kind === 'payment' ? 'wallet-money' : cat?.icon ?? 'tag';
              const color = t.kind === 'payment' ? '#94a3b8' : rootOf(categories, t.categoryId)?.color ?? '#94a3b8';
              return (
                <div key={t.id} className="fin-tx">
                  <span className="fin-tx-icon" style={{ color, background: `${color}24` }}><Icon name={icon} size={18} /></span>
                  <div className="fin-tx-main">
                    <b>{t.description}</b>
                    <p>{t.kind === 'payment' ? 'Card Payment' : `${t.method === 'credit' ? 'Credit' : 'Debit'} · ${cat?.name ?? 'Uncategorized'}`}{t.upcoming ? ' · Scheduled' : t.recurringId ? ' · Recurring' : ''}</p>
                  </div>
                  {!t.upcoming && <span className="fin-minis"><Mini icon="lucide-file-pen" label="Edit" onClick={() => setModal({ t: 'edit', tx: t })} /><Mini icon="lucide-trash" label="Delete" onClick={() => setModal({ t: 'del', tx: t })} danger /></span>}
                  <span className={`fin-amt ${t.kind === 'expense' ? 'neg' : ''}`}>{t.kind === 'expense' ? '−' : ''} {money(t.amount)}</span>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {modal?.t === 'pay' && <PayCardForm card={card} onClose={() => setModal(null)} />}
      {modal?.t === 'edit' && (modal.tx.kind === 'payment'
        ? <PayCardForm card={card} initial={modal.tx} onClose={() => setModal(null)} />
        : <TransactionForm initial={modal.tx} onClose={() => setModal(null)} />)}
      {modal?.t === 'del' && <DeleteTransaction tx={modal.tx} onClose={() => setModal(null)} />}
      {modal?.t === 'del-card' && (
        <ConfirmDelete title={`Delete ${card.name}?`} onClose={() => setModal(null)}
          message="Everything recorded with this card is deleted too. This cannot be undone."
          onConfirm={async () => { if (await deleteCard(card.id)) { toast.success('Card deleted'); onBack(); } }} />
      )}
    </>
  );
}
