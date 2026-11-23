import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../Icon';
import { logoUrl } from '../../lib/bank-logos';
import { type Account, type BankCard, type Category, type Range, type Tx, iso, money, parse, rootOf } from '../../lib/finance/model';
import { useCategoryTotals, useFinance, useTransactions } from '../../lib/finance/store';
import { CardBrand } from './brand';
import { AccountForm, CardForm, CategoryForm, ConfirmDelete, DeleteTransaction, PayCardForm, SavingForm, TransactionForm } from './forms';

export function Mini({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`fin-mini${danger ? ' danger' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={14} />
    </button>
  );
}

export const shortDate = (s: string) => parse(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

export function Heading({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="fin-tab-head">
      <div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
      <div className="fin-tab-actions">{children}</div>
    </div>
  );
}

// -- Accounts: a summary, then cards in a grid ------------------------------------------------

/** What a transaction does to one account's balance (credit spending uses the card's limit instead). */
function effect(t: Tx, a: Account): number {
  if (t.kind === 'transfer') return (t.toAccountId === a.id ? t.amount : 0) - (t.accountId === a.id ? t.amount : 0);
  if (t.accountId !== a.id || t.method === 'credit') return 0;
  return t.kind === 'income' ? t.amount : -t.amount;
}

/** The balance on each of the last 30 days, worked back from today's balance. */
function history(a: Account, txs: Tx[], days: string[]): number[] {
  const today = days[days.length - 1];
  return days.map((d) => a.balance - txs.filter((t) => t.date > d && t.date <= today).reduce((n, t) => n + effect(t, a), 0));
}

function Sparkline({ values }: { values: number[] }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = (v: number) => (hi === lo ? 35 : 62 - ((v - lo) / (hi - lo)) * 54);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 300).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <svg className="ac-spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="ac-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#20e7aa" stopOpacity=".35" /><stop offset="1" stopColor="#20e7aa" stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,70 ${pts.join(' ')} 300,70`} fill="url(#ac-fill)" />
      <polyline points={pts.join(' ')} fill="none" stroke="#20e7aa" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const AccountLogo = ({ a, size = 'sm' }: { a: Account; size?: 'sm' | 'lg' }) => {
  const url = logoUrl(a.logoKey);
  return <span className={`fin-logo ${size === 'lg' ? 'huge' : 'ac-logo'}`}>{url ? <img src={url} alt="" /> : <Icon name={a.icon ?? 'wallet'} size={size === 'lg' ? 26 : 18} />}</span>;
};

/** A savings account's progress toward its target: a bar, what is saved, and about how long is left. */
function SavingsProgress({ account: a }: { account: Account }) {
  const target = a.target ?? 0;
  const pct = target ? Math.max(0, Math.min(100, Math.round((a.balance / target) * 100))) : 0;
  return (
    <div className="fin-acct-goal">
      <div className="fin-acct-goal-top"><b>{pct}%</b><span>Of {money(target)}</span></div>
      <div className="fin-bar"><span style={{ width: `${pct}%`, background: a.color ?? '#20e7aa' }} /></div>
      <p className="fin-hint">{pct >= 100 ? 'Target Reached' : a.monthsLeft ? `About ${a.monthsLeft} Month${a.monthsLeft > 1 ? 's' : ''} At Your Pace` : `${money(target - a.balance)} To Go`}</p>
    </div>
  );
}

/** Accounts: a short list on the left; the account picked there shows its balance, a 30-day curve and its latest movements. */
export function AccountsTab() {
  const { accounts, cards, categories, deleteAccount } = useFinance();
  const [modal, setModal] = useState<null | { t: 'account'; a?: Account; savings?: boolean } | { t: 'saving'; id?: string } | { t: 'del-acc'; a: Account }>(null);
  const [pick, setPick] = useState<string | null>(null);
  const close = () => setModal(null);

  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return iso(d); }), []);
  const all = useTransactions({ range: { from: days[0], to: days[29], preset: 'custom' }, kind: 'all' });

  const everyday = accounts.filter((a) => !a.savings);
  const pots = accounts.filter((a) => a.savings);
  const sum = (list: Account[]) => list.reduce((n, a) => n + a.balance, 0);
  const sel = accounts.find((a) => a.id === pick) ?? accounts[0];
  const mine = sel ? all.filter((t) => t.accountId === sel.id || t.toAccountId === sel.id) : [];
  const myCards = sel ? cards.filter((c) => c.accountId === sel.id) : [];
  const list = mine.filter((t) => effect(t, sel!) !== 0);
  const curve = useMemo(() => (sel ? history(sel, mine, days) : []), [sel, mine, days]);
  const change = curve.length > 1 && sel ? sel.balance - curve[0] : 0; // what the balance did over the 30 days
  const out = sel ? list.reduce((n, t) => n + Math.min(0, effect(t, sel)), 0) : 0; // money that left the account in those 30 days

  const row = (a: Account) => (
    <button key={a.id} type="button" className="ac-pick" data-on={sel?.id === a.id} onClick={() => setPick(a.id)}>
      <AccountLogo a={a} />
      <span className="ac-pick-name"><b>{a.name}</b><small>{a.savings ? (a.target ? `${Math.max(0, Math.round((a.balance / a.target) * 100))}% Of ${money(a.target)}` : 'Savings') : cards.filter((c) => c.accountId === a.id).length ? `${cards.filter((c) => c.accountId === a.id).length} ${cards.filter((c) => c.accountId === a.id).length > 1 ? 'Cards' : 'Card'}` : 'No Cards'}</small></span>
      <strong className={a.balance < 0 ? 'neg' : ''}>{money(a.balance)}</strong>
    </button>
  );

  return (
    <>
      <Heading title="Accounts" hint={accounts.length ? `Total ${money(sum(accounts))}` : undefined}>
        <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'account', savings: true })}><Icon name="wallet-money" size={15} />New Savings</button>
        <button type="button" className="fin-btn" onClick={() => setModal({ t: 'account' })}><Icon name="add-circle" size={16} />New Account</button>
      </Heading>

      {accounts.length === 0 && <p className="fin-empty">No accounts yet. Create your first account to start tracking.</p>}
      {sel && (
        <div className="ac-split">
          <div className="ac-rail">
            {everyday.map(row)}
            {pots.length > 0 && <small className="ac-rail-sec">Savings</small>}
            {pots.map(row)}
          </div>

          <section className="ac-detail" key={sel.id}>
            <header>
              <AccountLogo a={sel} />
              <div className="fin-acct-name">
                <h4>{sel.name}</h4>
                <p>{sel.savings ? 'Savings' : myCards.length ? `${myCards.length} ${myCards.length > 1 ? 'Cards' : 'Card'} · ${myCards.map((c) => c.name).join(', ')}` : 'No Cards'}</p>
              </div>
              <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'account', a: sel })}><Icon name="pen" size={14} />Edit</button>
              <button type="button" className="fin-btn-quiet danger" onClick={() => setModal({ t: 'del-acc', a: sel })}><Icon name="trash-bin-2" size={14} />Delete</button>
            </header>

            <div className="ac-top">
              <div className="ac-bal">
                <small>Balance</small>
                <strong className={sel.balance < 0 ? 'neg' : ''}>{money(sel.balance)}</strong>
                {curve.length > 1 && <span className="ac-change">30 Days: <b className={change < 0 ? 'neg' : change > 0 ? 'pos' : ''}>{change === 0 ? money(0) : `${change > 0 ? '+' : '−'} ${money(Math.abs(change))}`}</b>{out < 0 && <> vs. <b className="neg">− {money(-out)}</b></>}</span>}
              </div>
              {curve.length > 1 && <Sparkline values={curve} />}
            </div>
            {sel.savings && (
              <div className="ac-pot">
                {sel.target ? <SavingsProgress account={sel} /> : <span />}
                <button type="button" className="fin-btn" onClick={() => setModal({ t: 'saving', id: sel.id })}><Icon name="wallet-money" size={15} />Save Money</button>
              </div>
            )}
          </section>
        </div>
      )}

      {modal?.t === 'saving' && <SavingForm toId={modal.id} onClose={close} />}
      {modal?.t === 'account' && <AccountForm initial={modal.a} savings={modal.savings} onClose={close} />}
      {modal?.t === 'del-acc' && (
        <ConfirmDelete title={`Delete ${modal.a.name}?`} onClose={close}
          message="This also deletes its cards and every transaction recorded on it. This cannot be undone."
          onConfirm={async () => { if (await deleteAccount(modal.a.id)) { setPick(null); toast.success('Account deleted'); } }} />
      )}
    </>
  );
}

// -- Cards: one row per card, each opens its own screen ---------------------------------------

const MODE = { credit: 'Credit', debit: 'Debit', both: 'MultiFunction' } as const;

/** Cards: each one drawn as a bank card; the one picked shows its invoice on the right, with Pay, Open and Settings. */
export function CardsTab({ onOpenCard }: { onOpenCard: (c: BankCard, settings?: boolean) => void }) {
  const { accounts, cards } = useFinance();
  const [modal, setModal] = useState<null | { t: 'card' } | { t: 'pay'; c: BankCard }>(null);
  const [at, setAt] = useState(0);
  const close = () => setModal(null);
  const card = cards[Math.min(at, cards.length - 1)];
  const step = (n: number) => setAt((i) => (i + n + cards.length) % cards.length);

  const isCredit = card ? card.mode !== 'debit' : false;
  const pct = card && isCredit && card.limit ? Math.min(100, Math.round((card.used / card.limit) * 100)) : 0;

  return (
    <>
      <Heading title="Cards">
        <button type="button" className="fin-btn" onClick={() => setModal({ t: 'card' })} disabled={!accounts.length}><Icon name="add-circle" size={16} />New Card</button>
      </Heading>
      {cards.length === 0 && <p className="fin-empty">{accounts.length ? 'No cards yet. Add one and link it to an account.' : 'Create an account first, then add its cards here.'}</p>}
      {card && (
        <div className="cd-split">
          <div className="cd-left">
            <div className="cd-wrap">
              {cards.length > 1 && <button type="button" className="cd-arrow" aria-label="Previous card" onClick={() => step(-1)}>‹</button>}
              <article className="cd-card" key={card.id} onClick={() => cards.length > 1 && step(1)} data-multi={cards.length > 1 || undefined}>
                <header><span className="fin-chip-gold" aria-hidden="true" /><small>{MODE[card.mode]}</small></header>
                <footer>
                  <div><b>{card.name}</b><span>{accounts.find((a) => a.id === card.accountId)?.name}</span></div>
                  <CardBrand brand={card.brand} />
                </footer>
              </article>
              {cards.length > 1 && <button type="button" className="cd-arrow" aria-label="Next card" onClick={() => step(1)}>›</button>}
            </div>
            {cards.length > 1 && (
              <div className="cd-dots" role="tablist" aria-label="Cards">
                {cards.map((c, i) => <button key={c.id} type="button" role="tab" aria-label={c.name} aria-selected={i === at} data-on={i === at} onClick={() => setAt(i)} />)}
              </div>
            )}
          </div>

          <section className="cd-invoice">
            {isCredit ? (
              <>
                <div className="cd-nums">
                  <b>{money(card.used)}</b>
                  <span>Of {money(card.limit)}</span>
                  <i className="chip">{pct}%</i>
                </div>
                <div className="fin-bar"><span style={{ width: `${pct}%`, background: pct > 85 ? '#ff6b6b' : 'linear-gradient(90deg,#10c3d3,#20e7aa)' }} /></div>
                <p className="fin-hint">Closes {shortDate(card.cycle.close)} · Due {shortDate(card.cycle.due)}</p>
              </>
            ) : (
              <p className="fin-hint">Spends straight from the account.</p>
            )}
            <div className="cd-actions">
              {isCredit && <button type="button" className="fin-btn" onClick={() => setModal({ t: 'pay', c: card })}><Icon name="wallet-money" size={15} />Pay</button>}
              <button type="button" className="fin-btn-quiet" onClick={() => onOpenCard(card)}>Open</button>
              <button type="button" className="fin-btn-quiet" onClick={() => onOpenCard(card, true)}><Icon name="pen" size={14} />Settings</button>
            </div>
          </section>
        </div>
      )}
      {modal?.t === 'card' && <CardForm onClose={close} />}
      {modal?.t === 'pay' && <PayCardForm card={modal.c} onClose={close} />}
    </>
  );
}

// -- Transactions: a day-by-day timeline ---------------------------------------------------------

const METHOD = { cash: 'Cash', pix: 'Pix', debit: 'Debit', credit: 'Credit' } as const;

export function TransactionsTab({ range, initialKind, accountId, onClearAccount }: { range: Range; initialKind: Tx['kind'] | 'all'; accountId?: string | null; onClearAccount?: () => void }) {
  const { categories, accounts, cards, deleteTx } = useFinance();
  const [kind, setKind] = useState<Tx['kind'] | 'all' | 'card'>(initialKind);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<null | { t: 'edit'; tx: Tx } | { t: 'del'; tx: Tx }>(null);
  const found = useTransactions({ range, kind, q });
  const txs = accountId ? found.filter((t) => t.accountId === accountId || t.toAccountId === accountId) : found; // one account's, when asked

  const by = new Map<string, Tx[]>();
  for (const t of txs) by.set(t.date, [...(by.get(t.date) ?? []), t]);
  const groups = [...by.entries()];

  const where = (t: Tx) => {
    const card = cards.find((c) => c.id === t.cardId);
    const acc = accounts.find((a) => a.id === t.accountId);
    if (t.kind === 'transfer') return `${acc?.name ?? '?'} → ${accounts.find((a) => a.id === t.toAccountId)?.name ?? '?'}`;
    if (t.kind === 'payment') return `${acc?.name ?? '?'} → ${card?.name ?? '?'}`;
    return `${METHOD[t.method]} · ${card?.name ?? acc?.name ?? ''}`;
  };

  return (
    <>
      <Heading title="Transactions" hint={accountId ? `Only ${accounts.find((a) => a.id === accountId)?.name ?? 'This Account'}` : undefined}>
        {accountId && onClearAccount && <button type="button" className="fin-btn-quiet" onClick={onClearAccount}>Show All Accounts</button>}
      </Heading>
      <div className="fin-toolbar">
        <label className="fin-search"><Icon name="magnifer" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions" aria-label="Search transactions" /></label>
        <div className="fin-filter">
          {(['all', 'income', 'expense', 'card', 'transfer'] as const).map((k) => (
            <button key={k} type="button" data-active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'transfer' ? 'Transfers' : k === 'card' ? 'Card Expenses' : k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>
      {groups.length === 0 && <p className="fin-empty">Nothing Here For This Period And Filter.</p>}
      <div className="fin-timeline">
        {groups.map(([date, rows]) => {
          const net = rows.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0);
          return (
            <section key={date} className="fin-day">
              <header>
                <b>{parse(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                <span className={net < 0 ? 'neg' : net > 0 ? 'pos' : ''}>{net === 0 ? '' : `${net > 0 ? '+' : '−'} ${money(Math.abs(net))}`}</span>
              </header>
              {rows.map((t) => {
                const cat = categories.find((c) => c.id === t.categoryId);
                const root = rootOf(categories, t.categoryId);
                const icon: IconName = t.kind === 'payment' ? 'wallet-money' : t.kind === 'transfer' ? 'transfer-horizontal' : cat?.icon ?? 'tag';
                const color = t.kind === 'transfer' || t.kind === 'payment' ? '#94a3b8' : root?.color ?? '#94a3b8';
                return (
                  <div key={t.id} className="fin-tx">
                    <span className="fin-tx-icon" style={{ color, background: `${color}24` }}><Icon name={icon} size={18} /></span>
                    <div className="fin-tx-main">
                      <b>{t.description}</b>
                      <p>{t.kind === 'transfer' ? 'Transfer' : t.kind === 'payment' ? 'Card Payment' : cat?.name ?? 'Uncategorized'}{t.recurringId ? ' · Recurring' : ''} · {where(t)}</p>
                    </div>
                    <span className="fin-minis"><Mini icon="pen" label="Edit" onClick={() => setModal({ t: 'edit', tx: t })} /><Mini icon="trash-bin-2" label="Delete" onClick={() => setModal({ t: 'del', tx: t })} danger /></span>
                    <span className={`fin-amt ${t.kind === 'expense' ? 'neg' : t.kind === 'income' ? 'pos' : ''}`}>{t.kind === 'expense' ? '−' : t.kind === 'income' ? '+' : ''} {money(t.amount)}</span>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {modal?.t === 'edit' && (modal.tx.kind === 'payment' && cards.some((c) => c.id === modal.tx.cardId)
        ? <PayCardForm card={cards.find((c) => c.id === modal.tx.cardId)!} initial={modal.tx} onClose={() => setModal(null)} />
        : <TransactionForm initial={modal.tx} onClose={() => setModal(null)} />)}
      {modal?.t === 'del' && <DeleteTransaction tx={modal.tx} onClose={() => setModal(null)} />}
    </>
  );
}

// -- Categories: tinted tiles with their subcategories ---------------------------------------------------

export function CategoriesTab({ range }: { range: Range }) {
  const { categories, deleteCategory } = useFinance();
  const [kind, setKind] = useState<Category['kind']>('income');
  const [modal, setModal] = useState<null | { t: 'cat'; c?: Category; parent?: Category } | { t: 'del'; c: Category }>(null);
  const close = () => setModal(null);
  const totals = useCategoryTotals(kind, range);

  const roots = categories.filter((c) => c.kind === kind && !c.parentId);
  return (
    <>
      <Heading title="Categories">
        <div className="fin-filter">
          {(['income', 'expense'] as const).map((k) => <button key={k} type="button" data-active={kind === k} onClick={() => setKind(k)}>{k === 'expense' ? 'Expenses' : 'Income'}</button>)}
        </div>
        <button type="button" className="fin-btn" onClick={() => setModal({ t: 'cat' })}><Icon name="add-circle" size={16} />New Category</button>
      </Heading>
      {roots.length === 0 && <p className="fin-empty">No categories here yet.</p>}
      <div className="fin-cat-grid">
        {roots.map((c) => {
          const subs = categories.filter((s) => s.parentId === c.id).sort((x, y) => x.name.localeCompare(y.name));
          return (
            <article key={c.id} className="fin-card fin-cat" style={{ ['--tone' as string]: c.color }}>
              <header>
                <span className="fin-cat-icon"><Icon name={c.icon} size={22} /></span>
                <div><h4>{c.name}</h4><p>{money(totals[c.id] ?? 0)} This Period</p></div>
                <span className="fin-minis always">
                  <Mini icon="pen" label={`Edit ${c.name}`} onClick={() => setModal({ t: 'cat', c })} />
                  <Mini icon="trash-bin-2" label={`Delete ${c.name}`} onClick={() => setModal({ t: 'del', c })} danger />
                </span>
              </header>
              <div className="fin-subs">
                {subs.map((s) => (
                  <span key={s.id} className="fin-sub">
                    <button type="button" onClick={() => setModal({ t: 'cat', c: s })} aria-label={`Edit ${s.name}`}>{s.name}</button>
                    <button type="button" className="x" onClick={() => setModal({ t: 'del', c: s })} aria-label={`Delete ${s.name}`}><Icon name="close-circle" size={13} /></button>
                  </span>
                ))}
                <button type="button" className="fin-sub add" onClick={() => setModal({ t: 'cat', parent: c })}><Icon name="add-circle" size={13} />Subcategory</button>
              </div>
            </article>
          );
        })}
      </div>
      {modal?.t === 'cat' && <CategoryForm initial={modal.c} parent={modal.parent} kind={kind} onClose={close} />}
      {modal?.t === 'del' && (
        <ConfirmDelete title={`Delete ${modal.c.name}?`} onClose={close}
          message={modal.c.parentId
            ? 'Its transactions move to the parent category.'
            : 'Its subcategories are deleted too, and its transactions become uncategorized.'}
          onConfirm={async () => { if (await deleteCategory(modal.c.id)) toast.success('Category deleted'); }} />
      )}
    </>
  );
}
