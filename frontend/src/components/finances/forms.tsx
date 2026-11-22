import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../Icon';
import { Cycler } from '../Cycler';
import { Popup } from '../Popup';
import { matchLogoKey } from '../../lib/bank-logos';
import {
  type Account, type BankCard, type Category, type PayMethod, type Tx, type TxKind,
  CARD_BRANDS, iso, money, parseCents,
} from '../../lib/finance/model';
import type { EditScope } from '../../lib/finance/api';
import { useFinance, useTransactions } from '../../lib/finance/store';

const SWATCHES = ['#20e7aa', '#10c3d3', '#60a5fa', '#8b7cf6', '#f472a6', '#ff6b6b', '#fb923c', '#f6c38f', '#fbbf24', '#94a3b8'];

const CATEGORY_ICONS: IconName[] = [
  'cart-large-2', 'cup-hot', 'bus', 'car', 'fuel', 'home-2', 'bill-list', 'bolt', 'phone-calling', 'heart-pulse', 'pills',
  'dumbbell-large-minimalistic', 'monitor-smartphone', 'tv', 'bag-smile', 't-shirt', 'shop-2', 'gamepad-minimalistic',
  'clapperboard-play', 'music-note-2', 'plain-2', 'book-2', 'gift', 'paw', 'card-2', 'banknote-2', 'case-minimalistic',
  'hand-money', 'hand-heart', 'safe-square', 'star-shine', 'tag',
];

function Field({ label, error, className = '', children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`fin-field ${className}`}>
      <span>{label}</span>
      {children}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

function Actions({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <div className="fin-form-actions">
      <button type="button" className="fin-btn-quiet" onClick={onClose}>Cancel</button>
      <button type="submit" className="fin-btn">{label}</button>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="fin-seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} data-active={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

// -- Autocomplete for the description: names you already used, with the category and account that went with them --------

const stripCount = (d: string) => d.replace(/ \(\d+\/\d+\)$/, '').trim(); // "Gym (3/12)" is "Gym"

/** The names used in the last year for this kind of transaction, newest first, each with how it was filled in last time. */
function useNameHistory(kind: 'income' | 'expense'): (Tx & { uses: number })[] {
  const range = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 365);
    return { from: iso(from), to: iso(new Date()), preset: 'custom' as const };
  }, []);
  const all = useTransactions({ range, kind });
  return useMemo(() => {
    const seen = new Map<string, Tx & { uses: number }>();
    for (const t of [...all].sort((a, b) => b.date.localeCompare(a.date))) {
      const name = stripCount(t.description);
      const key = name.toLowerCase();
      if (!name) continue;
      const known = seen.get(key);
      if (known) known.uses += 1;
      else seen.set(key, { ...t, description: name, uses: 1 });
    }
    return [...seen.values()];
  }, [all]);
}

// -- Category: the groups as small named chips, and the group's own categories right below ---------

/** Pick a category by name: tap a group (it is chosen at once, as the general one) and, if it has more specific ones, tap one of them. */
function CategoryPicker({ cats, value, onChange }: { cats: Category[]; value: string; onChange: (id: string) => void }) {
  const parents = cats.filter((c) => !c.parentId);
  const owner = (id: string) => cats.find((c) => c.id === id)?.parentId ?? id; // the group a category belongs to
  const [open, setOpen] = useState(value ? owner(value) : '');
  const subs = (id: string) => cats.filter((c) => c.parentId === id).sort((a, b) => a.name.localeCompare(b.name));
  const group = parents.find((p) => p.id === (value ? owner(value) : open));
  const extra = group ? subs(group.id) : [];
  return (
    <div className="fin-field" role="group" aria-label="Category">
      <span>Category</span>
      <div className="cat-grid">
        {parents.map((p) => (
          <button key={p.id} type="button" className="cat-group" aria-pressed={group?.id === p.id} data-on={group?.id === p.id}
            onClick={() => { setOpen(p.id); onChange(p.id); }}>
            {p.name}
          </button>
        ))}
      </div>
      {group && extra.length > 0 && (
        <div className="cat-subs" role="group" aria-label={`${group.name} Categories`}>
          <button type="button" className="cat-chip" data-on={value === group.id} onClick={() => onChange(group.id)}>General</button>
          {extra.map((c) => <button key={c.id} type="button" className="cat-chip" data-on={value === c.id} onClick={() => onChange(c.id)}>{c.name}</button>)}
        </div>
      )}
    </div>
  );
}

// -- Transaction: income, expense or transfer between accounts -----------------

export function TransactionForm({ initial, onClose }: { initial?: Tx; onClose: () => void }) {
  const { accounts, cards, categories, recurring, saveTx, saveRecurring, stopRecurring, repeatTx } = useFinance();
  const [repeat, setRepeat] = useState<'none' | 'monthly' | 'installments'>('none');
  const [installments, setInstallments] = useState('12');
  const rule = recurring.find((r) => r.id === initial?.recurringId && r.active);
  const [kind, setKind] = useState<'income' | 'expense' | 'transfer'>(
    initial && (initial.kind === 'income' || initial.kind === 'expense' || initial.kind === 'transfer') ? initial.kind : 'expense',
  );
  const [amount, setAmount] = useState(initial ? String(initial.amount / 100).replace('.', ',') : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(initial?.date ?? iso(new Date()));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? accounts[1]?.id ?? '');
  const [method, setMethod] = useState<PayMethod>(initial?.method ?? 'pix');
  const [cardId, setCardId] = useState(initial?.cardId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<null | ((scope: EditScope) => Promise<void>)>(null); // asks which charges an edit reaches
  const [scope, setScope] = useState<EditScope>('one');

  const history = useNameHistory(kind === 'income' ? 'income' : 'expense');
  const [focus, setFocus] = useState(false);
  const typed = description.toLowerCase();
  // The single most likely name: one that starts with what is typed, the most used first, then the newest.
  const guess = !initial && kind !== 'transfer' && focus && description.trim()
    ? history.filter((t) => t.description.toLowerCase().startsWith(typed.trimStart()) && t.description.toLowerCase() !== typed.trim())
      .sort((x, y) => y.uses - x.uses)[0]
    : undefined;
  const ghost = guess ? guess.description.slice(description.trimStart().length) : '';
  /** Take a past name, and the category and account (or card) that went with it. */
  const applySuggestion = (t: Tx) => {
    setDescription(t.description);
    if (t.categoryId && categories.some((c) => c.id === t.categoryId && c.kind === kind)) setCategoryId(t.categoryId);
    setMethod(t.method);
    if ((t.method === 'debit' || t.method === 'credit') && t.cardId && cards.some((c) => c.id === t.cardId)) setCardId(t.cardId);
    else { setCardId(''); if (accounts.some((a) => a.id === t.accountId)) setAccountId(t.accountId); }
    setFocus(false);
  };
  const needsCard = kind !== 'transfer' && (method === 'debit' || method === 'credit');
  const eligible = cards.filter((c) => (method === 'credit' ? c.mode !== 'debit' : c.mode !== 'credit'));
  const cats = categories.filter((c) => c.kind === kind);
  const inRule = !!initial?.recurringId && recurring.some((r) => r.id === initial.recurringId);
  const repeatable = kind === 'expense' && !inRule; // income and transfers do not repeat; a repeating one is stopped instead

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseCents(amount);
    const err: Record<string, string> = {};
    if (!cents || cents <= 0) err.amount = 'Enter an amount greater than zero';
    if (!date) err.date = 'Pick a date';
    if (kind === 'transfer') {
      if (accountId === toAccountId) err.to = 'Choose two different accounts';
    } else {
      if (!description.trim()) err.description = 'Add a short description';
      if (!categoryId) err.category = 'Choose a category';
      if (needsCard && !cardId) err.card = 'Choose a Card';
    }
    const parts = Number(installments);
    if (repeatable && repeat === 'installments' && !(Number.isInteger(parts) && parts >= 2 && parts <= 120)) err.installments = 'Use 2 to 120 installments';
    setErrors(err);
    if (Object.keys(err).length) return;
    const card = cards.find((c) => c.id === cardId);
    if (repeatable && repeat !== 'none' && initial) { // an existing expense starts repeating from its own date
      if (await saveTx({
        id: initial.id, date, kind: 'expense', amount: cents!, description: description.trim(), categoryId,
        accountId: needsCard && card ? card.accountId : accountId, method, cardId: needsCard ? cardId : undefined,
      }) && await repeatTx(initial.id, repeat === 'installments' ? parts : null)) {
        toast.success(repeat === 'installments' ? `${parts} installments scheduled` : 'Monthly expense added');
        onClose();
      }
      return;
    }
    if (repeatable && repeat !== 'none') {
      if (await saveRecurring({
        date, description: description.trim(), categoryId, amount: cents!, method,
        accountId: needsCard && card ? card.accountId : accountId, cardId: needsCard ? cardId : undefined,
        installments: repeat === 'installments' ? parts : null,
      })) {
        toast.success(repeat === 'installments' ? `${parts} installments scheduled` : 'Monthly expense added');
        onClose();
      }
      return;
    }
    const commit = async (scope: EditScope) => {
      if (await saveTx({
        id: initial?.id, date, kind: kind as TxKind, amount: cents!,
        description: kind === 'transfer' ? description.trim() || 'Transfer' : description.trim(),
        categoryId: kind === 'transfer' ? '' : categoryId,
        accountId: needsCard && card ? card.accountId : accountId,
        toAccountId: kind === 'transfer' ? toAccountId : undefined,
        method: kind === 'transfer' ? 'pix' : method,
        cardId: needsCard ? cardId : undefined,
      }, scope)) {
        toast.success(initial ? 'Transaction Updated' : 'Transaction Added');
        onClose();
      }
    };
    if (inRule && kind === 'expense') setAsk(() => commit);
    else await commit('one');
  };

  return (
    <Popup title={initial ? 'Edit Transaction' : 'Add Transaction'} hideTitle={!initial} onClose={onClose} wide className="fin-dialog">
      <form className="fin-form fin-form-add" onSubmit={submit} noValidate>
        <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(''); }}
          options={[{ id: 'income', label: 'Income' }, { id: 'expense', label: 'Expense' }, { id: 'transfer', label: 'Transaction' }]} />
        <div className="fin-row">
          <Field label="Amount" error={errors.amount} className="fin-amount"><div className="fin-amount-box"><i>R$</i><input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div></Field>
          <Field label="Date" error={errors.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label={kind === 'transfer' ? 'Note (Optional)' : 'Description'} error={errors.description}>
          <div className="sg-wrap">
            <input value={description} autoComplete="off" placeholder={kind === 'transfer' ? 'Move to savings' : 'Tithe'}
              onChange={(e) => { setDescription(e.target.value); setFocus(true); }}
              onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
              onKeyDown={(e) => {
                if (!guess) return;
                const atEnd = e.currentTarget.selectionStart === description.length;
                if (e.key === 'Tab' || e.key === 'Enter' || (e.key === 'ArrowRight' && atEnd)) { e.preventDefault(); applySuggestion(guess); }
              }} />
            {guess && ghost && <span className="sg-ghost" aria-hidden="true"><i>{description}</i>{ghost}</span>}
          </div>
        </Field>
        {kind === 'transfer' ? (
          <div className="fin-row">
            <Cycler label="From" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
            <Cycler label="To" value={toAccountId} onChange={setToAccountId} error={errors.to} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
        ) : (
          <>
            <div>
              <CategoryPicker cats={cats} value={categoryId} onChange={setCategoryId} />
              {errors.category && <em className="cat-err" role="alert">{errors.category}</em>}
            </div>
            <div className={`fin-row ${repeatable ? 'fin-row3' : 'fin-row-pay'}`}>
              <Cycler label="Payment Method" value={method} onChange={(m) => { setMethod(m); setCardId(''); }}
                options={[{ value: 'cash', label: 'Cash' }, { value: 'pix', label: 'Pix' }, { value: 'debit', label: 'Debit' }, { value: 'credit', label: 'Credit' }]} />
              {needsCard ? (
                <Cycler label="Card" value={cardId} onChange={setCardId} placeholder="Choose A Card" error={errors.card}
                  options={eligible.map((c) => ({ value: c.id, label: c.name }))} />
              ) : (
                <Cycler label="Account" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
              )}
              {repeatable && (
                <Cycler label="Recurring" value={repeat} onChange={setRepeat}
                  options={[{ value: 'none', label: 'Once' }, { value: 'monthly', label: 'Every Month' }, { value: 'installments', label: 'Installments' }]} />
              )}
            </div>
            {repeatable && repeat === 'installments' && (
              <Field label="Number Of Installments" error={errors.installments}>
                <input inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} placeholder="12" />
              </Field>
            )}
          </>
        )}
        {rule && (
          <p className="fin-hint">
            Repeats every month{rule.total ? ` (${rule.made} of ${rule.total} installments recorded)` : ''}.{' '}
            <button type="button" className="fin-link-add" onClick={async () => { if (await stopRecurring(rule.id)) { toast.success('Stopped repeating'); onClose(); } }}>Stop repeating</button>
          </p>
        )}
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Add'} />
      </form>
      {ask && (
        <Popup title="Recurring" hideTitle onClose={() => setAsk(null)}>
          <div className="fin-form">
            <Segmented value={scope} onChange={setScope}
              options={[{ id: 'one', label: 'This One' }, { id: 'following', label: 'This and Following' }, { id: 'all', label: 'All' }]} />
            <div className="fin-form-actions">
              <button type="button" className="fin-btn-quiet" onClick={() => setAsk(null)}>Cancel</button>
              <button type="button" className="fin-btn" onClick={() => void ask(scope)}>OK</button>
            </div>
          </div>
        </Popup>
      )}
    </Popup>
  );
}

// -- Paying a credit card bill ahead of its closing date ------------------------------------

export function PayCardForm({ card, initial, onClose }: { card: BankCard; initial?: Tx; onClose: () => void }) {
  const { accounts, saveTx } = useFinance();
  const [amount, setAmount] = useState(String((initial?.amount ?? card.used) / 100).replace('.', ','));
  const [date, setDate] = useState(initial?.date ?? iso(new Date()));
  const [accountId, setAccountId] = useState(initial?.accountId ?? card.accountId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseCents(amount);
    const err: Record<string, string> = {};
    if (!cents || cents <= 0) err.amount = 'Enter an amount greater than zero';
    if (!date) err.date = 'Pick a date';
    setErrors(err);
    if (Object.keys(err).length) return;
    if (await saveTx({ id: initial?.id, date, kind: 'payment', amount: cents!, description: '', categoryId: '', accountId, method: 'pix', cardId: card.id })) {
      toast.success(`${money(cents!)} paid on ${card.name}`);
      onClose();
    }
  };
  return (
    <Popup title={initial ? `Edit Payment on ${card.name}` : `Pay ${card.name}`} onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <p className="fin-hint">{money(card.used)} of {money(card.limit)} is in use. What you pay now frees that part of the limit right away.</p>
        <div className="fin-row">
          <Field label="Amount" error={errors.amount}><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Date" error={errors.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Paid from"><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Pay'} />
      </form>
    </Popup>
  );
}

// -- Account ----------------------------------------------------------------------

const ACCOUNT_ICONS: IconName[] = ['wallet', 'wallet-money', 'card-2', 'banknote-2', 'safe-square', 'buildings-2', 'hand-money', 'case-minimalistic'];

export function AccountForm({ initial, savings, onClose }: { initial?: Account; savings?: boolean; onClose: () => void }) {
  const saveAccount = useFinance((s) => s.saveAccount);
  const [name, setName] = useState(initial?.name ?? '');
  const [opening, setOpening] = useState(initial ? String(initial.opening / 100).replace('.', ',') : '');
  const [icon, setIcon] = useState<IconName>(initial?.icon ?? (savings ? 'safe-square' : 'wallet'));
  const isSavings = savings || !!initial?.savings;
  const [target, setTarget] = useState(initial?.target ? String(initial.target / 100).replace('.', ',') : '');
  const [color, setColor] = useState(initial?.color ?? SWATCHES[0]);
  const [error, setError] = useState('');
  const [targetError, setTargetError] = useState('');
  const logo = matchLogoKey(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the account a name');
    const cents = target.trim() ? parseCents(target) : null;
    if (isSavings && target.trim() && (!cents || cents <= 0)) return setTargetError('Enter a target amount, or leave it empty');
    if (await saveAccount({ id: initial?.id, name: name.trim(), opening: opening ? parseCents(opening) ?? 0 : 0, icon, savings: isSavings, target: isSavings ? cents : null, color: isSavings ? color : null })) {
      toast.success(initial ? 'Account updated' : 'Account added');
      onClose();
    }
  };
  return (
    <Popup title={`${initial ? 'Edit' : 'New'} ${isSavings ? 'Savings Account' : 'Account'}`} onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Name" error={error}><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder={isSavings ? 'Savings, Emergency reserve' : 'C6 Bank, Cash, Travel money'} /></Field>
        <Field label="Opening balance"><input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" /></Field>
        {isSavings && (
          <>
            <Field label="Target (Optional)" error={targetError}><input inputMode="decimal" value={target} onChange={(e) => { setTarget(e.target.value); setTargetError(''); }} placeholder="7.500,00" /></Field>
            <Field label="Color"><div className="fin-swatches">{SWATCHES.map((c) => <button key={c} type="button" aria-label={c} data-active={color === c} style={{ background: c }} onClick={() => setColor(c)} />)}</div></Field>
          </>
        )}
        {logo ? (
          <p className="fin-hint">Bank recognized: its logo will be used.</p>
        ) : (
          <Field label="Icon">
            <div className="fin-icons">{ACCOUNT_ICONS.map((n) => (
              <button key={n} type="button" aria-label={n} data-active={icon === n} style={icon === n ? { color: '#20e7aa', borderColor: '#20e7aa' } : undefined} onClick={() => setIcon(n)}><Icon name={n} size={18} /></button>
            ))}</div>
          </Field>
        )}
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Add Account'} />
      </form>
    </Popup>
  );
}

// -- Card -------------------------------------------------------------------------

/** The card's settings as a form: *onDone* runs after it is saved, *onCancel* when the user backs out. */
export function CardFormBody({ initial, accountId, onDone, onCancel }: { initial?: BankCard; accountId?: string; onDone: () => void; onCancel: () => void }) {
  const { accounts, saveCard } = useFinance();
  const [name, setName] = useState(initial?.name ?? '');
  const [acc, setAcc] = useState(initial?.accountId ?? accountId ?? accounts[0]?.id ?? '');
  const [mode, setMode] = useState<BankCard['mode']>(initial?.mode ?? 'both');
  const [limit, setLimit] = useState(initial ? String(initial.limit / 100).replace('.', ',') : '');
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 10));
  const [closeBefore, setCloseBefore] = useState(String(initial?.closeDaysBefore ?? 7));
  const [brand, setBrand] = useState<string>(initial?.brand ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const credit = mode !== 'debit';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Give the card a name';
    if (!acc) err.acc = 'Create an account first';
    if (credit && !(parseCents(limit) ?? 0)) err.limit = 'Enter the credit limit';
    const due = Number(dueDay);
    if (credit && !(due >= 1 && due <= 31)) err.due = 'Use a day from 1 to 31';
    const before = Number(closeBefore);
    if (credit && !(before >= 0 && before <= 28)) err.close = 'Use 0 to 28 days';
    setErrors(err);
    if (Object.keys(err).length) return;
    if (await saveCard({ id: initial?.id, name: name.trim(), accountId: acc, mode, limit: credit ? parseCents(limit)! : 0, dueDay: credit ? due : 1, closeDaysBefore: credit ? before : 0, brand: (brand || null) as BankCard['brand'] })) {
      toast.success(initial ? 'Card Updated' : 'Card Added');
      onDone();
    }
  };
  return (
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Name" error={errors.name}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="C6 Carbon" /></Field>
        <Field label="Account (Debit Spends From)" error={errors.acc}>
          <select value={acc} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label="Brand (Optional)">
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">None</option>
            {CARD_BRANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Works as">
          <Segmented value={mode} onChange={setMode} options={[{ id: 'credit', label: 'Credit' }, { id: 'debit', label: 'Debit' }, { id: 'both', label: 'MultiFunction' }]} />
        </Field>
        {credit && (
          <>
            <Field label="Credit limit" error={errors.limit}><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="5.000,00" /></Field>
            <div className="fin-row">
              <Field label="Due day of the month" error={errors.due}><input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></Field>
              <Field label="Closes days before due" error={errors.close}>
                <input inputMode="numeric" list="fin-close-presets" value={closeBefore} onChange={(e) => setCloseBefore(e.target.value)} />
                <datalist id="fin-close-presets">{[3, 5, 7, 10].map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
            </div>
          </>
        )}
        <Actions onClose={onCancel} label={initial ? 'Save Changes' : 'Add Card'} />
      </form>
  );
}

export function CardForm({ initial, accountId, onClose }: { initial?: BankCard; accountId?: string; onClose: () => void }) {
  return (
    <Popup title={initial ? 'Edit Card' : 'New Card'} onClose={onClose}>
      <CardFormBody initial={initial} accountId={accountId} onDone={onClose} onCancel={onClose} />
    </Popup>
  );
}

// -- Category ---------------------------------------------------------------------

export function CategoryForm({ initial, parent, kind: kindProp, onClose }: { initial?: Category; parent?: Category; kind?: Category['kind']; onClose: () => void }) {
  const saveCategory = useFinance((s) => s.saveCategory);
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<Category['kind']>(initial?.kind ?? parent?.kind ?? kindProp ?? 'expense');
  const [color, setColor] = useState(initial?.color ?? parent?.color ?? SWATCHES[0]);
  const [icon, setIcon] = useState<IconName>(initial?.icon ?? parent?.icon ?? 'tag');
  const parentId = initial?.parentId ?? parent?.id ?? ''; // set by the Subcategory button, not chosen here
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the category a name');
    if (await saveCategory({ id: initial?.id, name: name.trim(), kind, color, icon, parentId: parentId || null })) {
      toast.success(initial ? 'Category updated' : 'Category added');
      onClose();
    }
  };
  return (
    <Popup title={initial ? 'Edit Category' : parent ? `New Subcategory of ${parent.name}` : 'New Category'} onClose={onClose} wide>
      <form className="fin-form" onSubmit={submit} noValidate>
        {!initial && !parent && <Segmented value={kind} onChange={setKind} options={[{ id: 'income', label: 'Income' }, { id: 'expense', label: 'Expense' }]} />}
        <Field label="Name" error={error}><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Groceries" /></Field>
        <Field label="Color">
          <div className="fin-swatches">{SWATCHES.map((c) => <button key={c} type="button" aria-label={c} data-active={color === c} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        </Field>
        <Field label="Icon">
          <div className="fin-icons">{CATEGORY_ICONS.map((n) => (
            <button key={n} type="button" aria-label={n} data-active={icon === n} style={icon === n ? { color, borderColor: color } : undefined} onClick={() => setIcon(n)}><Icon name={n} size={18} /></button>
          ))}</div>
        </Field>
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Add Category'} />
      </form>
    </Popup>
  );
}

// -- Saving money: a transfer into a savings account ------------------------------------------

export function SavingForm({ toId, onClose }: { toId?: string | null; onClose: () => void }) {
  const { accounts, saveTx } = useFinance();
  const pots = accounts.filter((a) => a.savings);
  const [to, setTo] = useState(toId ?? pots[0]?.id ?? '');
  const [from, setFrom] = useState(() => accounts.find((a) => a.id !== (toId ?? pots[0]?.id))?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const cents = parseCents(amount);
    if (!to) err.to = 'Create a savings account first';
    if (!from) err.from = 'Choose where the money comes from';
    else if (from === to) err.from = 'Choose another account than the savings account';
    if (!cents || cents <= 0) err.amount = 'Enter an amount greater than zero';
    setErrors(err);
    if (Object.keys(err).length) return;
    const dest = accounts.find((x) => x.id === to)!;
    if (await saveTx({ date, kind: 'transfer', amount: cents!, description: `${dest.name} Deposit`, categoryId: '', accountId: from, toAccountId: to, method: 'pix' })) {
      toast.success(`${money(cents!)} saved to ${dest.name}`);
      onClose();
    }
  };
  return (
    <Popup title="Save Money" onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Save to" error={errors.to}><select value={to} onChange={(e) => setTo(e.target.value)}>{pots.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <div className="fin-row">
          <Field label="Amount" error={errors.amount}><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Taken from" error={errors.from}><select value={from} onChange={(e) => setFrom(e.target.value)}>{accounts.filter((a) => a.id !== to).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Actions onClose={onClose} label="Save Money" />
      </form>
    </Popup>
  );
}

// -- Delete confirmation ----------------------------------------------------------------

/** Delete one transaction; for a recurring expense, ask whether that charge, it and the later ones, or all go. */
export function DeleteTransaction({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const { recurring, deleteTx } = useFinance();
  const [scope, setScope] = useState<EditScope>('one');
  const inRule = !!tx.recurringId && recurring.some((r) => r.id === tx.recurringId);
  const remove = async () => {
    if (await deleteTx(tx.id, inRule ? scope : 'one')) toast.success('Transaction deleted');
    onClose();
  };
  return (
    <Popup title="Delete This Transaction?" onClose={onClose}>
      <div className="fin-form">
        {inRule ? (
          <Segmented value={scope} onChange={setScope}
            options={[{ id: 'one', label: 'This One' }, { id: 'following', label: 'This and Following' }, { id: 'all', label: 'All' }]} />
        ) : (
          <p className="fin-hint">{tx.description}, {money(tx.amount)} on {new Date(`${tx.date}T00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}.</p>
        )}
        <div className="fin-form-actions">
          <button type="button" className="fin-btn-quiet" onClick={onClose}>Cancel</button>
          <button type="button" className="fin-btn danger" onClick={() => void remove()}>Delete</button>
        </div>
      </div>
    </Popup>
  );
}

export function ConfirmDelete({ title, message, onConfirm, onClose }: { title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Popup title={title} onClose={onClose}>
      <p className="fin-hint" style={{ marginBottom: 14 }}>{message}</p>
      <div className="fin-form-actions">
        <button type="button" className="fin-btn-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="fin-btn danger" onClick={() => { onConfirm(); onClose(); }}>Delete</button>
      </div>
    </Popup>
  );
}
