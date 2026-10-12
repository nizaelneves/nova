import { useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../Icon';
import { logoUrl } from '../../lib/bank-logos';
import { type Account, type BankCard, type Category, type Goal, type Range, type Tx, money, parse, rootOf } from '../../lib/finance/model';
import { useCategoryTotals, useFinance, useTransactions } from '../../lib/finance/store';
import { AccountForm, CardForm, CategoryForm, ConfirmDelete, GoalForm, SavingForm, TransactionForm } from './forms';

function Mini({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`fin-mini${danger ? ' danger' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={14} />
    </button>
  );
}

const shortDate = (s: string) => parse(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

function Heading({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="fin-tab-head">
      <div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
      <div className="fin-tab-actions">{children}</div>
    </div>
  );
}

// -- Accounts: quiet rows, the logo up front, cards listed underneath -------------------

function CardLine({ card, onEdit, onDelete }: { card: BankCard; onEdit: () => void; onDelete: () => void }) {
  const credit = card.mode !== 'debit';
  const pct = credit && card.limit ? Math.min(100, Math.round((card.used / card.limit) * 100)) : 0;
  return (
    <li className="fin-cardline">
      <span className="fin-chip-gold" aria-hidden="true" />
      <div className="fin-cardline-name">
        <b>{card.name}</b>
        <span>{card.mode === 'both' ? 'MultiFunction' : credit ? 'Credit' : 'Debit'}</span>
      </div>
      {credit ? (
        <div className="fin-cardline-use">
          <div className="fin-bar"><span style={{ width: `${pct}%`, background: pct > 85 ? '#ff6b6b' : 'linear-gradient(90deg,#10c3d3,#20e7aa)' }} /></div>
          <span>{money(card.used)} of {money(card.limit)} · Closes {shortDate(card.cycle.close)} · Due {shortDate(card.cycle.due)}</span>
        </div>
      ) : (
        <span className="fin-cardline-use quiet">Spends straight from the account</span>
      )}
      <span className="fin-minis"><Mini icon="pen" label={`Edit ${card.name}`} onClick={onEdit} /><Mini icon="trash-bin-minimalistic" label={`Delete ${card.name}`} onClick={onDelete} danger /></span>
    </li>
  );
}

export function AccountsTab() {
  const { accounts, cards, deleteAccount, deleteCard } = useFinance();
  const [modal, setModal] = useState<null | { t: 'account'; a?: Account } | { t: 'card'; c?: BankCard; acc?: string } | { t: 'saving' } | { t: 'del-acc'; a: Account } | { t: 'del-card'; c: BankCard }>(null);
  const close = () => setModal(null);

  return (
    <>
      <Heading title="Accounts">
        <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'saving' })}><Icon name="wallet-money" size={15} />New Savings</button>
        <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'card' })} disabled={!accounts.length}><Icon name="card-2" size={15} />New Card</button>
        <button type="button" className="fin-btn" onClick={() => setModal({ t: 'account' })}><Icon name="add-circle" size={16} />New Account</button>
      </Heading>

      {accounts.length === 0 && <p className="fin-empty">No accounts yet. Create your first account to start tracking.</p>}
      <div className="fin-acct-list">
        {accounts.map((a) => {
          const url = logoUrl(a.logoKey);
          const mine = cards.filter((c) => c.accountId === a.id);
          return (
            <article key={a.id} className="fin-acct">
              <div className="fin-acct-main">
                <span className="fin-logo huge">{url ? <img src={url} alt="" /> : <Icon name={a.icon ?? 'wallet'} size={28} />}</span>
                <div className="fin-acct-name">
                  <h4>{a.name}</h4>
                  <p>{mine.length ? `${mine.length} card${mine.length > 1 ? 's' : ''}` : 'No cards'}</p>
                </div>
                <strong className="fin-acct-balance">{money(a.balance)}</strong>
                <span className="fin-minis"><Mini icon="pen" label={`Edit ${a.name}`} onClick={() => setModal({ t: 'account', a })} /><Mini icon="trash-bin-minimalistic" label={`Delete ${a.name}`} onClick={() => setModal({ t: 'del-acc', a })} danger /></span>
              </div>
              <ul className="fin-acct-cards">
                {mine.map((c) => (
                  <CardLine key={c.id} card={c} onEdit={() => setModal({ t: 'card', c })} onDelete={() => setModal({ t: 'del-card', c })} />
                ))}
                <li><button type="button" className="fin-link-add" onClick={() => setModal({ t: 'card', acc: a.id })}><Icon name="add-circle" size={15} />Add Card</button></li>
              </ul>
            </article>
          );
        })}
      </div>

      {modal?.t === 'account' && <AccountForm initial={modal.a} onClose={close} />}
      {modal?.t === 'card' && <CardForm initial={modal.c} accountId={modal.acc} onClose={close} />}
      {modal?.t === 'saving' && <SavingForm onClose={close} />}
      {modal?.t === 'del-acc' && (
        <ConfirmDelete title={`Delete ${modal.a.name}?`} onClose={close}
          message="This also deletes its cards and every transaction recorded on it. This cannot be undone."
          onConfirm={async () => { if (await deleteAccount(modal.a.id)) toast.success('Account deleted'); }} />
      )}
      {modal?.t === 'del-card' && (
        <ConfirmDelete title={`Delete ${modal.c.name}?`} onClose={close}
          message="Its transactions are deleted with it. This cannot be undone."
          onConfirm={async () => { if (await deleteCard(modal.c.id)) toast.success('Card deleted'); }} />
      )}
    </>
  );
}

// -- Goals: progress rings -----------------------------------------------------------------

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 96 96" className="fin-ring" role="img" aria-label={`${pct}% saved`}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 48 48)" style={{ transition: 'stroke-dasharray .7s cubic-bezier(.23,1,.32,1)' }} />
      <text x="48" y="48" textAnchor="middle" dominantBaseline="central" fill="#e8e8ed" fontSize="19" fontWeight="700">{pct}%</text>
    </svg>
  );
}

export function GoalsTab() {
  const { goals, deleteGoal } = useFinance();
  const [modal, setModal] = useState<null | { t: 'goal'; g?: Goal } | { t: 'saving'; id?: string } | { t: 'del'; g: Goal }>(null);
  const close = () => setModal(null);
  return (
    <>
      <Heading title="Goals">
        <button type="button" className="fin-btn" onClick={() => setModal({ t: 'goal' })}><Icon name="add-circle" size={16} />New Goal</button>
      </Heading>
      {goals.length === 0 && <p className="fin-empty">No goals yet. Create one to start saving toward it.</p>}
      <div className="fin-goal-grid">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
          return (
            <article key={g.id} className="fin-card fin-goal-card" style={{ ['--tone' as string]: g.color }}>
              <span className="fin-minis always"><Mini icon="pen" label={`Edit ${g.name}`} onClick={() => setModal({ t: 'goal', g })} /><Mini icon="trash-bin-minimalistic" label={`Delete ${g.name}`} onClick={() => setModal({ t: 'del', g })} danger /></span>
              <Ring pct={pct} color={g.color} />
              <h4>{g.name}</h4>
              <p className="fin-goal-amounts"><b>{money(g.saved)}</b> of {money(g.target)}</p>
              <p className="fin-goal-eta">
                {pct >= 100 ? 'Goal reached' : g.monthsLeft ? `About ${g.monthsLeft} month${g.monthsLeft > 1 ? 's' : ''} at your pace` : `${money(g.target - g.saved)} to go`}
              </p>
              <button type="button" className="fin-btn-quiet" onClick={() => setModal({ t: 'saving', id: g.id })}><Icon name="wallet-money" size={15} />Save Money</button>
            </article>
          );
        })}
      </div>
      {modal?.t === 'goal' && <GoalForm initial={modal.g} onClose={close} />}
      {modal?.t === 'saving' && <SavingForm goalId={modal.id} onClose={close} />}
      {modal?.t === 'del' && (
        <ConfirmDelete title={`Delete ${modal.g.name}?`} onClose={close}
          message="Its deposits are deleted too, so that money goes back to your accounts."
          onConfirm={async () => { if (await deleteGoal(modal.g.id)) toast.success('Goal deleted'); }} />
      )}
    </>
  );
}

// -- Transactions: a day-by-day timeline ---------------------------------------------------------

const METHOD = { cash: 'Cash', pix: 'Pix', debit: 'Debit', credit: 'Credit' } as const;

export function TransactionsTab({ range, initialKind }: { range: Range; initialKind: Tx['kind'] | 'all' }) {
  const { categories, accounts, cards, deleteTx } = useFinance();
  const [kind, setKind] = useState<Tx['kind'] | 'all'>(initialKind);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<null | { t: 'edit'; tx: Tx } | { t: 'del'; tx: Tx }>(null);
  const txs = useTransactions({ range, kind, q });

  const by = new Map<string, Tx[]>();
  for (const t of txs) by.set(t.date, [...(by.get(t.date) ?? []), t]);
  const groups = [...by.entries()];

  const where = (t: Tx) => {
    const card = cards.find((c) => c.id === t.cardId);
    const acc = accounts.find((a) => a.id === t.accountId);
    if (t.kind === 'transfer') return `${acc?.name ?? '?'} → ${accounts.find((a) => a.id === t.toAccountId)?.name ?? '?'}`;
    return `${METHOD[t.method]} · ${card?.name ?? acc?.name ?? ''}`;
  };

  return (
    <>
      <Heading title="Transactions" />
      <div className="fin-toolbar">
        <label className="fin-search"><Icon name="magnifer" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions" aria-label="Search transactions" /></label>
        <div className="fin-filter">
          {(['all', 'income', 'expense', 'savings', 'transfer'] as const).map((k) => (
            <button key={k} type="button" data-active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'transfer' ? 'Transfers' : k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>
      {groups.length === 0 && <p className="fin-empty">Nothing here for this period and filter.</p>}
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
                const icon: IconName = t.kind === 'savings' ? 'wallet-money' : t.kind === 'transfer' ? 'transfer-horizontal' : cat?.icon ?? 'tag';
                const color = t.kind === 'savings' ? '#f6c38f' : t.kind === 'transfer' ? '#94a3b8' : root?.color ?? '#94a3b8';
                return (
                  <div key={t.id} className="fin-tx">
                    <span className="fin-tx-icon" style={{ color, background: `${color}24` }}><Icon name={icon} size={18} /></span>
                    <div className="fin-tx-main">
                      <b>{t.description}</b>
                      <p>{t.kind === 'savings' ? 'Savings' : t.kind === 'transfer' ? 'Transfer' : cat?.name ?? 'Uncategorized'} · {where(t)}</p>
                    </div>
                    <span className="fin-minis"><Mini icon="pen" label="Edit" onClick={() => setModal({ t: 'edit', tx: t })} /><Mini icon="trash-bin-minimalistic" label="Delete" onClick={() => setModal({ t: 'del', tx: t })} danger /></span>
                    <span className={`fin-amt ${t.kind === 'expense' ? 'neg' : t.kind === 'income' ? 'pos' : ''}`}>{t.kind === 'expense' ? '−' : t.kind === 'income' ? '+' : ''} {money(t.amount)}</span>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {modal?.t === 'edit' && (modal.tx.kind === 'savings'
        ? <SavingForm initial={modal.tx} onClose={() => setModal(null)} />
        : <TransactionForm initial={modal.tx} onClose={() => setModal(null)} />)}
      {modal?.t === 'del' && (
        <ConfirmDelete title="Delete this transaction?" message={`${modal.tx.description}, ${money(modal.tx.amount)} on ${shortDate(modal.tx.date)}.`} onClose={() => setModal(null)}
          onConfirm={async () => { if (await deleteTx(modal.tx.id)) toast.success('Transaction deleted'); }} />
      )}
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
                <div><h4>{c.name}</h4><p>{money(totals[c.id] ?? 0)} this period</p></div>
                <span className="fin-minis always">
                  <Mini icon="pen" label={`Edit ${c.name}`} onClick={() => setModal({ t: 'cat', c })} />
                  <Mini icon="trash-bin-minimalistic" label={`Delete ${c.name}`} onClick={() => setModal({ t: 'del', c })} danger />
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
