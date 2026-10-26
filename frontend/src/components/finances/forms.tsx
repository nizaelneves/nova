import { useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../Icon';
import { Popup } from '../Popup';
import { matchLogoKey } from '../../lib/bank-logos';
import {
  type Account, type BankCard, type Category, type Goal, type PayMethod, type Tx, type TxKind,
  iso, money, parseCents,
} from '../../lib/finance/model';
import { useFinance } from '../../lib/finance/store';

const SWATCHES = ['#20e7aa', '#10c3d3', '#60a5fa', '#8b7cf6', '#f472a6', '#ff6b6b', '#fb923c', '#f6c38f', '#fbbf24', '#94a3b8'];

const CATEGORY_ICONS: IconName[] = [
  'cart-large-2', 'cup-hot', 'bus', 'car', 'fuel', 'home-2', 'bill-list', 'bolt', 'phone-calling', 'heart-pulse', 'pills',
  'dumbbell-large-minimalistic', 'monitor-smartphone', 'tv', 'bag-smile', 't-shirt', 'shop-2', 'gamepad-minimalistic',
  'clapperboard-play', 'music-note-2', 'plain-2', 'book-2', 'gift', 'paw', 'card-2', 'banknote-2', 'case-minimalistic',
  'hand-money', 'hand-heart', 'safe-square', 'star-shine', 'tag',
];

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="fin-field">
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

// -- Transaction: income, expense or transfer between accounts -----------------

export function TransactionForm({ initial, onClose }: { initial?: Tx; onClose: () => void }) {
  const { accounts, cards, categories, recurring, saveTx, saveRecurring, stopRecurring } = useFinance();
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

  const needsCard = kind !== 'transfer' && (method === 'debit' || method === 'credit');
  const eligible = cards.filter((c) => (method === 'credit' ? c.mode !== 'debit' : c.mode !== 'credit'));
  const cats = categories.filter((c) => c.kind === kind);
  const repeatable = kind === 'expense' && !initial; // income and transfers do not repeat

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
    if (await saveTx({
      id: initial?.id, date, kind: kind as TxKind, amount: cents!,
      description: kind === 'transfer' ? description.trim() || 'Transfer' : description.trim(),
      categoryId: kind === 'transfer' ? '' : categoryId,
      accountId: needsCard && card ? card.accountId : accountId,
      toAccountId: kind === 'transfer' ? toAccountId : undefined,
      method: kind === 'transfer' ? 'pix' : method,
      cardId: needsCard ? cardId : undefined,
    })) {
      toast.success(initial ? 'Transaction updated' : 'Transaction added');
      onClose();
    }
  };

  return (
    <Popup title={initial ? 'Edit Transaction' : 'Add Transaction'} hideTitle={!initial} onClose={onClose} wide>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(''); }}
          options={[{ id: 'income', label: 'Income' }, { id: 'expense', label: 'Expense' }, { id: 'transfer', label: 'Transaction' }]} />
        <div className="fin-row">
          <Field label="Amount" error={errors.amount}><input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Date" error={errors.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label={kind === 'transfer' ? 'Note (optional)' : 'Description'} error={errors.description}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'transfer' ? 'Move to savings' : 'Supermarket'} />
        </Field>
        {kind === 'transfer' ? (
          <div className="fin-row">
            <Field label="From"><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="To" error={errors.to}><select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          </div>
        ) : (
          <>
            <Field label="Category" error={errors.category}>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Choose…</option>
                {cats.filter((c) => !c.parentId).map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    <option value={p.id}>{p.name}</option>
                    {cats.filter((c) => c.parentId === p.id).sort((x, y) => x.name.localeCompare(y.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <Segmented value={method} onChange={(m) => { setMethod(m); setCardId(''); }}
                options={[{ id: 'cash', label: 'Cash' }, { id: 'pix', label: 'Pix' }, { id: 'debit', label: 'Debit' }, { id: 'credit', label: 'Credit' }]} />
            </Field>
            {needsCard ? (
              <Field label="Card" error={errors.card}>
                <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                  <option value="">Choose a Card…</option>
                  {eligible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Account"><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            )}
          </>
        )}
        {repeatable && (
          <>
            <Field label="Recurring">
              {/* Nothing is selected until the user picks one; picking the same option again clears it. */}
              <Segmented value={repeat} onChange={(r) => setRepeat(r === repeat ? 'none' : r)}
                options={[{ id: 'monthly', label: 'Every Month' }, { id: 'installments', label: 'Installments' }]} />
            </Field>
            {repeat === 'installments' && (
              <Field label="Number of installments" error={errors.installments}>
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

export function AccountForm({ initial, onClose }: { initial?: Account; onClose: () => void }) {
  const saveAccount = useFinance((s) => s.saveAccount);
  const [name, setName] = useState(initial?.name ?? '');
  const [opening, setOpening] = useState(initial ? String(initial.opening / 100).replace('.', ',') : '');
  const [icon, setIcon] = useState<IconName>(initial?.icon ?? 'wallet');
  const [error, setError] = useState('');
  const logo = matchLogoKey(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the account a name');
    if (await saveAccount({ id: initial?.id, name: name.trim(), opening: opening ? parseCents(opening) ?? 0 : 0, icon })) {
      toast.success(initial ? 'Account updated' : 'Account added');
      onClose();
    }
  };
  return (
    <Popup title={initial ? 'Edit Account' : 'New Account'} onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Name" error={error}><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="C6 Bank, Cash, Travel money" /></Field>
        <Field label="Opening balance"><input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" /></Field>
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

export function CardForm({ initial, accountId, onClose }: { initial?: BankCard; accountId?: string; onClose: () => void }) {
  const { accounts, saveCard } = useFinance();
  const [name, setName] = useState(initial?.name ?? '');
  const [acc, setAcc] = useState(initial?.accountId ?? accountId ?? accounts[0]?.id ?? '');
  const [mode, setMode] = useState<BankCard['mode']>(initial?.mode ?? 'both');
  const [limit, setLimit] = useState(initial ? String(initial.limit / 100).replace('.', ',') : '');
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 10));
  const [closeBefore, setCloseBefore] = useState(String(initial?.closeDaysBefore ?? 7));
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
    if (await saveCard({ id: initial?.id, name: name.trim(), accountId: acc, mode, limit: credit ? parseCents(limit)! : 0, dueDay: credit ? due : 1, closeDaysBefore: credit ? before : 0 })) {
      toast.success(initial ? 'Card updated' : 'Card added');
      onClose();
    }
  };
  return (
    <Popup title={initial ? 'Edit Card' : 'New Card'} onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Name" error={errors.name}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="C6 Carbon" /></Field>
        <Field label="Account (Debit Spends From)" error={errors.acc}>
          <select value={acc} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
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
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Add Card'} />
      </form>
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

// -- Goal and saving deposit --------------------------------------------------------

export function GoalForm({ initial, onClose }: { initial?: Goal; onClose: () => void }) {
  const saveGoal = useFinance((s) => s.saveGoal);
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial ? String(initial.target / 100).replace('.', ',') : '');
  const [color, setColor] = useState(initial?.color ?? SWATCHES[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Give the goal a name';
    const cents = parseCents(target);
    if (!cents || cents <= 0) err.target = 'Enter a target amount';
    setErrors(err);
    if (Object.keys(err).length) return;
    if (await saveGoal({ id: initial?.id, name: name.trim(), target: cents!, color })) {
      toast.success(initial ? 'Goal updated' : 'Goal added');
      onClose();
    }
  };
  return (
    <Popup title={initial ? 'Edit Goal' : 'New Goal'} onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Name" error={errors.name}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacation trip" /></Field>
        <Field label="Target" error={errors.target}><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="7.500,00" /></Field>
        <Field label="Color"><div className="fin-swatches">{SWATCHES.map((c) => <button key={c} type="button" aria-label={c} data-active={color === c} style={{ background: c }} onClick={() => setColor(c)} />)}</div></Field>
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Add Goal'} />
      </form>
    </Popup>
  );
}

export function SavingForm({ goalId, initial, onClose }: { goalId?: string | null; initial?: Tx; onClose: () => void }) {
  const { goals, accounts, saveTx } = useFinance();
  const [goal, setGoal] = useState(initial?.goalId ?? goalId ?? goals[0]?.id ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount / 100).replace('.', ',') : '');
  const [date, setDate] = useState(initial?.date ?? iso(new Date()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const cents = parseCents(amount);
    if (!goal) err.goal = 'Create a goal first';
    if (!accountId) err.account = 'Create an account first';
    if (!cents || cents <= 0) err.amount = 'Enter an amount greater than zero';
    setErrors(err);
    if (Object.keys(err).length) return;
    const g = goals.find((x) => x.id === goal)!;
    if (await saveTx({ id: initial?.id, date, kind: 'savings', amount: cents!, description: `${g.name} deposit`, categoryId: '', accountId, method: 'pix', goalId: goal })) {
      toast.success(`${money(cents!)} saved to ${g.name}`);
      onClose();
    }
  };
  return (
    <Popup title={initial ? 'Edit Savings' : 'New Savings'} onClose={onClose}>
      <form className="fin-form" onSubmit={submit} noValidate>
        <Field label="Goal" error={errors.goal}><select value={goal} onChange={(e) => setGoal(e.target.value)}>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <div className="fin-row">
          <Field label="Amount" error={errors.amount}><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Taken from" error={errors.account}><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Actions onClose={onClose} label={initial ? 'Save Changes' : 'Save Money'} />
      </form>
    </Popup>
  );
}

// -- Delete confirmation ----------------------------------------------------------------

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
