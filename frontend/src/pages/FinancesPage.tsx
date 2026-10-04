import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../components/Icon';
import { Popup } from '../components/Popup';
import { logoUrl, matchLogoKey } from '../lib/bank-logos';
import {
  Account,
  Bank,
  Card,
  Category,
  CategoryTotal,
  FinancesApiError,
  Invoice,
  InvoiceDetail,
  LedgerEntryType,
  MonthTotals,
  OverviewBank,
  OverviewCard,
  Transaction,
  TransactionCreate,
  TxType,
  createAccount,
  createBank,
  createCard,
  createCategory,
  createTransaction,
  deleteAccount,
  deleteBank,
  deleteCard,
  deleteCategory,
  deleteTransaction,
  fetchBanks,
  fetchCards,
  fetchCategories,
  fetchCategoryReport,
  fetchInvoice,
  fetchInvoices,
  fetchMonthlyReport,
  fetchOverview,
  fetchTransactions,
  flattenCategories,
  formatCents,
  monthLabel,
  monthRange,
  monthString,
  parseAmountToCents,
  payInvoice,
  renameBank,
  renameCategory,
  shiftMonth,
  unpayInvoice,
  updateAccount,
  updateCard,
  updateTransaction,
} from '../lib/finances-api';
import { todayLocal } from '../lib/tasks-api';

function apiErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

const TYPE_ICON: Record<LedgerEntryType, { name: 'arrow-up' | 'arrow-down' | 'transfer-horizontal' | 'card'; color: string }> = {
  income: { name: 'arrow-down', color: 'var(--color-success, #34d399)' },
  expense: { name: 'arrow-up', color: 'var(--color-error)' },
  transfer: { name: 'transfer-horizontal', color: 'var(--color-text-tertiary)' },
  invoice_payment: { name: 'card', color: 'var(--color-text-tertiary)' },
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** A bank/card logo in a small circular badge (matching the reference app's
 * compact round icon treatment), falling back to a neutral building icon
 * when `logoKey` has no bundled asset. One fixed size everywhere this is
 * used, so every row — Overview, Accounts — reads at the same scale. */
const LOGO_BADGE_SIZE = 28;
function EntityLogo({ logoKey }: { logoKey: string | null | undefined }) {
  const url = logoUrl(logoKey);
  return (
    <span
      className="flex items-center justify-center rounded-full overflow-hidden shrink-0"
      style={{ width: LOGO_BADGE_SIZE, height: LOGO_BADGE_SIZE, background: url ? '#fff' : 'var(--color-bg-tertiary)' }}
    >
      {url ? (
        <img src={url} alt="" width={LOGO_BADGE_SIZE - 8} height={LOGO_BADGE_SIZE - 8} style={{ objectFit: 'contain' }} />
      ) : (
        <Icon name="buildings-2" size={14} style={{ color: 'var(--color-text-secondary)' }} />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Month navigator (Overview + History; not Reports, not Accounts)
// ---------------------------------------------------------------------------

function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      <button type="button" onClick={() => onChange(shiftMonth(month, -1))} className="composer-icon" aria-label="Previous month">
        <Icon name="alt-arrow-down" size={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
      <span className="text-sm font-medium w-40 text-center capitalize" style={{ color: 'var(--color-text)' }}>{monthLabel(month)}</span>
      <button type="button" onClick={() => onChange(shiftMonth(month, 1))} className="composer-icon" aria-label="Next month">
        <Icon name="alt-arrow-down" size={14} style={{ transform: 'rotate(-90deg)' }} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview: one card per Bank (with its nested Accounts), one per Card
// ---------------------------------------------------------------------------

const INVOICE_STATUS_COLOR: Record<Invoice['status'], string> = {
  open: 'var(--color-text-tertiary)',
  closed: '#d9a441',
  paid: 'var(--color-success, #34d399)',
};

/** One row in the "Banks & Cards" panel — logo left, name + kind caption,
 * balance/amount right with its own caption underneath. Mirrors the
 * reference app's compact two-line row (logo | Name / kind | Amount / caption)
 * rather than a big padded card per bank. */
function EntityRow({
  logoKey,
  name,
  caption,
  amount,
  amountCaption,
  amountColor,
  onClick,
  active,
}: {
  logoKey: string | null | undefined;
  name: string;
  caption: string;
  amount: string;
  amountCaption: string;
  amountColor?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
      }}
    >
      <EntityLogo logoKey={logoKey} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--color-heading)' }}>{name}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{caption}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold" style={{ color: amountColor ?? 'var(--color-heading)' }}>{amount}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{amountCaption}</div>
      </div>
    </Comp>
  );
}

function BankOverviewRows({ bank, selected, onSelect }: { bank: OverviewBank; selected: boolean; onSelect: (bankId: string | null) => void }) {
  return (
    <>
      <EntityRow
        logoKey={bank.logo_key}
        name={bank.name}
        caption="Bank"
        amount={formatCents(bank.accounts.reduce((sum, a) => sum + a.balance_cents, 0))}
        amountCaption="balance"
        active={selected}
        onClick={() => onSelect(selected ? null : bank.id)}
      />
      {bank.accounts.map((a) => (
        <div key={a.id} className="flex items-center justify-between text-xs pl-11 pr-3 py-1">
          <span style={{ color: 'var(--color-text-secondary)' }}>{a.name}</span>
          <span style={{ color: 'var(--color-text)' }}>{formatCents(a.balance_cents)}</span>
        </div>
      ))}
    </>
  );
}

function CardOverviewRow({ card, onOpen }: { card: OverviewCard; onOpen: (c: OverviewCard) => void }) {
  return (
    <EntityRow
      logoKey={card.logo_key}
      name={card.name}
      caption={`Due day ${card.due_day}`}
      amount={formatCents(card.current_invoice.total_cents)}
      amountColor={INVOICE_STATUS_COLOR[card.current_invoice.status]}
      amountCaption={card.current_invoice.status}
      onClick={() => onOpen(card)}
    />
  );
}

// ---------------------------------------------------------------------------
// Categories popup (bank/account/card management moved to the Accounts tab)
// ---------------------------------------------------------------------------

function ManageCategoryRow({ category, categories, onChanged }: { category: Category; categories: Category[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const others = flattenCategories(categories).filter((c) => c.id !== category.id && !(category.children ?? []).some((ch) => ch.id === c.id));

  const rename = async () => {
    const clean = draft.trim();
    if (!clean || clean === category.name) { setEditing(false); return; }
    try {
      await renameCategory(category.id, clean);
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setEditing(false);
    }
  };

  const remove = async (withMoveTo?: string) => {
    try {
      await deleteCategory(category.id, withMoveTo);
      setPendingDelete(false);
      onChanged();
    } catch (err) {
      if (err instanceof FinancesApiError && typeof err.detail === 'object' && err.detail && 'count' in (err.detail as any)) {
        setPendingDelete(true);
        setMoveTo(others[0]?.id ?? '');
      } else {
        toast.error(apiErrorMessage(err));
      }
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', marginLeft: category.parent_id ? '1.25rem' : 0 }}>
      {editing ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void rename()}
          onBlur={() => void rename()}
          className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--color-text)' }} />
      ) : (
        <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{category.name}</span>
      )}
      <button type="button" onClick={() => setEditing(true)} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
        <Icon name="pen" size={14} />
      </button>
      <button type="button" onClick={() => void remove()} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-error)' }}>
        <Icon name="trash-bin-minimalistic" size={14} />
      </button>
      {pendingDelete && (
        <Popup title={`Move transactions out of "${category.name}"`} onClose={() => setPendingDelete(false)}>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer mb-3"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            {others.map((c) => <option key={c.id} value={c.id}>{c.indent ? ' ' : ''}{c.name}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPendingDelete(false)} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            <button type="button" onClick={() => void remove(moveTo)} disabled={!moveTo} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50" style={{ background: 'var(--color-error)', color: '#fff' }}>Move and delete</button>
          </div>
        </Popup>
      )}
    </div>
  );
}

function CategoriesPopup({ onClose }: { onClose: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');

  const load = useCallback(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);
  useEffect(load, [load]);

  const addCategory = async () => {
    const clean = newCategory.trim();
    if (!clean) return;
    try {
      await createCategory(clean);
      setNewCategory('');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Popup title="Categories" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
          {categories.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No categories yet.</div>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <ManageCategoryRow category={c} categories={categories} onChanged={load} />
              {(c.children ?? []).map((child) => (
                <ManageCategoryRow key={child.id} category={child} categories={categories} onChanged={load} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addCategory()}
            placeholder="New category"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} />
          <button type="button" onClick={() => void addCategory()} disabled={!newCategory.trim()}
            className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
            Add
          </button>
        </div>
      </div>
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Accounts tab: inline Bank/Account/Card management (replaces the old
// NewWalletPopup / NewCardPopup / ManagePopup "accounts" tab)
// ---------------------------------------------------------------------------

const fieldStyle = { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };

function InlineRename({ name, onRename }: { name: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = async () => {
    const clean = draft.trim();
    setEditing(false);
    if (!clean || clean === name) { setDraft(name); return; }
    try {
      await onRename(clean);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setDraft(name);
    }
  };
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void commit()}
        onBlur={() => void commit()}
        className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--color-text)' }} />
    );
  }
  return (
    <span className="flex-1 flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text)' }}>
      {name}
      <button type="button" onClick={() => { setDraft(name); setEditing(true); }} className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
        <Icon name="pen" size={12} />
      </button>
    </span>
  );
}

function AccountRow({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const remove = async () => {
    try {
      await deleteAccount(account.id);
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 ml-6" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Account</span>
      <InlineRename name={account.name} onRename={(name) => updateAccount(account.id, { name }).then(() => onChanged())} />
      {account.kind === 'savings' && <span className="task-tab-count">savings</span>}
      <span className="text-sm" style={{ color: 'var(--color-text)' }}>{formatCents(account.balance_cents)}</span>
      <button type="button" onClick={() => void remove()} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-error)' }} title="Delete account">
        <Icon name="trash-bin-minimalistic" size={13} />
      </button>
    </div>
  );
}

function NewAccountInline({ bankId, onCreated }: { bankId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('0');
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="composer-chip ml-6 self-start">
        <Icon name="add-circle" size={13} /> Account
      </button>
    );
  }

  const save = async () => {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      await createAccount(bankId, clean, 'bank', parseAmountToCents(opening) ?? 0);
      setName(''); setOpening('0'); setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 ml-6">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Savings"
        onKeyDown={(e) => e.key === 'Enter' && void save()}
        className="text-sm px-3 py-1.5 rounded-lg outline-none" style={fieldStyle} />
      <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening balance"
        className="text-sm px-3 py-1.5 rounded-lg outline-none w-32" style={fieldStyle} />
      <button type="button" onClick={() => void save()} disabled={!name.trim() || saving}
        className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
        style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm px-2 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
    </div>
  );
}

function BankRow({ bank, onChanged }: { bank: Bank; onChanged: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = async () => {
    try {
      await deleteBank(bank.id);
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="finance-card">
      <div className="flex items-center gap-2">
        <EntityLogo logoKey={bank.logo_key} />
        <InlineRename name={bank.name} onRename={(name) => renameBank(bank.id, name).then(() => onChanged())} />
        <button type="button" onClick={() => setConfirmDelete(true)} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-error)' }} title="Delete bank">
          <Icon name="trash-bin-minimalistic" size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5 mt-2">
        {bank.accounts.map((a) => <AccountRow key={a.id} account={a} onChanged={onChanged} />)}
        <NewAccountInline bankId={bank.id} onCreated={onChanged} />
      </div>
      {confirmDelete && (
        <Popup title={`Delete "${bank.name}"?`} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            A Bank can only be deleted once it has no Accounts left under it.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            <button type="button" onClick={() => void remove()} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'var(--color-error)', color: '#fff' }}>Delete</button>
          </div>
        </Popup>
      )}
    </div>
  );
}

function NewBankInline({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('0');
  const [saving, setSaving] = useState(false);
  const preview = matchLogoKey(name);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="composer-chip self-start">
        <Icon name="add-circle" size={14} /> Bank
      </button>
    );
  }

  const save = async () => {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const bank = await createBank(clean);
      const openingCents = parseAmountToCents(opening) ?? 0;
      if (openingCents !== 0 && bank.accounts[0]) {
        await updateAccount(bank.accounts[0].id, { opening_cents: openingCents });
      }
      setName(''); setOpening('0'); setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="finance-card flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <EntityLogo logoKey={preview} />
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Bank name, e.g. Nubank"
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none" style={fieldStyle} />
      </div>
      <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening balance (optional)"
        className="text-sm px-3 py-1.5 rounded-lg outline-none" style={fieldStyle} />
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Creates its first account automatically — rename it afterward if you want.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={!name.trim() || saving}
          className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function CardRow({ card, onChanged, onOpen }: { card: Card; onChanged: () => void; onOpen: (c: Card) => void }) {
  return (
    <div className="finance-card flex items-center gap-2">
      <EntityLogo logoKey={card.logo_key} />
      <InlineRename name={card.name} onRename={(name) => updateCard(card.id, { name }).then(() => onChanged())} />
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Closes {card.closing_day} · Due {card.due_day}</span>
      <button type="button" onClick={() => onOpen(card)} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="Invoices">
        <Icon name="card" size={14} />
      </button>
    </div>
  );
}

function NewCardInline({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [closingDay, setClosingDay] = useState(1);
  const [dueDay, setDueDay] = useState(10);
  const [saving, setSaving] = useState(false);
  const preview = matchLogoKey(name);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="composer-chip self-start">
        <Icon name="add-circle" size={14} /> Card
      </button>
    );
  }

  const save = async () => {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      await createCard(clean, closingDay, dueDay);
      setName(''); setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="finance-card flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <EntityLogo logoKey={preview} />
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Card name, e.g. Nubank Ultravioleta"
          className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none" style={fieldStyle} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Closing day
          <input type="number" min={1} max={31} value={closingDay}
            onChange={(e) => setClosingDay(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            className="text-sm px-3 py-1.5 rounded-lg outline-none" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Due day
          <input type="number" min={1} max={31} value={dueDay}
            onChange={(e) => setDueDay(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            className="text-sm px-3 py-1.5 rounded-lg outline-none" style={fieldStyle} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={!name.trim() || saving}
          className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function AccountsPanel({ onOpenCard }: { onOpenCard: (c: Card) => void }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);

  const load = useCallback(() => {
    fetchBanks().then(setBanks).catch(() => setBanks([]));
    fetchCards().then(setCards).catch(() => setCards([]));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>Bancos e Contas</span>
        <div className="flex flex-col gap-3 mt-2">
          {banks?.map((b) => <BankRow key={b.id} bank={b} onChanged={load} />)}
          <NewBankInline onCreated={load} />
        </div>
      </div>
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>Cards</span>
        <div className="flex flex-col gap-3 mt-2">
          {cards.map((c) => <CardRow key={c.id} card={c} onChanged={load} onOpen={onOpenCard} />)}
          <NewCardInline onCreated={load} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card invoices
// ---------------------------------------------------------------------------

function PayInvoicePopup({
  accounts,
  onClose,
  onPay,
}: {
  accounts: Account[];
  onClose: () => void;
  onPay: (accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  return (
    <Popup title="Pay this invoice from…" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={fieldStyle}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
          <button type="button" onClick={() => onPay(accountId)} disabled={!accountId}
            className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
            Pay
          </button>
        </div>
      </div>
    </Popup>
  );
}

function InvoiceDetailPopup({
  card,
  invoice,
  accounts,
  onClose,
  onChanged,
}: {
  card: Card;
  invoice: Invoice;
  accounts: Account[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchInvoice(card.id, invoice.month).then(setDetail).catch(() => setDetail(null));
  }, [card.id, invoice.month]);
  useEffect(load, [load]);

  const pay = async (accountId: string) => {
    setBusy(true);
    try {
      await payInvoice(card.id, invoice.month, accountId);
      setShowPay(false);
      load();
      onChanged();
      toast.success('Invoice paid');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const unpay = async () => {
    setBusy(true);
    try {
      await unpayInvoice(card.id, invoice.month);
      load();
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popup title={`${card.name} · ${invoice.month}`} onClose={onClose} wide>
      {!detail ? (
        <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="task-tab-count" style={{ color: INVOICE_STATUS_COLOR[detail.status] }}>{detail.status}</span>
            <span className="text-lg font-semibold" style={{ color: 'var(--color-heading)' }}>{formatCents(detail.total_cents)}</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Closes {detail.closing_date} · Due {detail.due_date}
            {detail.paid_at && ` · Paid on ${detail.paid_at}`}
          </div>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {detail.transactions.length === 0 && (
              <div className="text-xs py-2" style={{ color: 'var(--color-text-tertiary)' }}>No purchases in this invoice.</div>
            )}
            {detail.transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm px-1">
                <span style={{ color: 'var(--color-text)' }}>
                  {t.description || 'Purchase'}
                  {t.installments_total ? ` (${t.installment_no}/${t.installments_total})` : ''}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{formatCents(t.amount_cents)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-1">
            {detail.status === 'paid' ? (
              <button type="button" onClick={() => void unpay()} disabled={busy}
                className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                style={{ color: 'var(--color-error)', border: '1px solid var(--color-border)' }}>
                Undo payment
              </button>
            ) : (
              <button type="button" onClick={() => setShowPay(true)} disabled={busy || detail.total_cents <= 0 || accounts.length === 0}
                className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
                Pay invoice
              </button>
            )}
          </div>
        </div>
      )}
      {showPay && <PayInvoicePopup accounts={accounts} onClose={() => setShowPay(false)} onPay={(a) => void pay(a)} />}
    </Popup>
  );
}

function CardInvoicesPopup({
  card,
  accounts,
  onClose,
  onChanged,
  onDeleted,
}: {
  card: Card;
  accounts: Account[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    fetchInvoices(card.id).then(setInvoices).catch(() => setInvoices([]));
  }, [card.id]);
  useEffect(load, [load]);

  const remove = async () => {
    try {
      await deleteCard(card.id);
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Popup title={card.name} onClose={onClose}>
      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
        {invoices === null && <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>}
        {invoices && invoices.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No invoices yet — make a purchase on this card.</div>
        )}
        {invoices?.map((inv) => (
          <button key={inv.month} type="button" onClick={() => setSelected(inv)} className="tx-row">
            <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{inv.month}</span>
            <span className="task-tab-count mr-2" style={{ color: INVOICE_STATUS_COLOR[inv.status] }}>{inv.status}</span>
            <span className="text-sm" style={{ color: 'var(--color-text)' }}>{formatCents(inv.total_cents)}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-3">
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="text-sm px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5"
          style={{ color: 'var(--color-error)' }}>
          <Icon name="trash-bin-minimalistic" size={15} /> Delete card
        </button>
        <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Close</button>
      </div>
      {selected && (
        <InvoiceDetailPopup card={card} invoice={selected} accounts={accounts} onClose={() => setSelected(null)} onChanged={() => { load(); onChanged(); }} />
      )}
      {confirmDelete && (
        <Popup title="Delete this card?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            {card.name}. Past purchases stay in your history, but the card itself is removed.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            <button type="button" onClick={() => void remove()} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'var(--color-error)', color: '#fff' }}>Delete</button>
          </div>
        </Popup>
      )}
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Add / edit transaction pop-up
// ---------------------------------------------------------------------------

function TransactionForm({
  accounts,
  cards,
  categories,
  tx,
  onClose,
  onSaved,
  onDeleted,
  onCategoryCreated,
}: {
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  tx: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onCategoryCreated: (c: Category) => void;
}) {
  // `tx.type` is never 'invoice_payment' in practice: those rows aren't editable (see the transactions list).
  const [type, setType] = useState<TxType>((tx?.type === 'invoice_payment' ? 'expense' : tx?.type) ?? 'expense');
  const [amount, setAmount] = useState(tx ? (tx.amount_cents / 100).toFixed(2).replace('.', ',') : '');
  const [date, setDate] = useState(tx?.date ?? todayLocal());
  const [payMethod, setPayMethod] = useState<'account' | 'card'>(tx?.card_id ? 'card' : 'account');
  const [accountId, setAccountId] = useState(tx?.account_id ?? accounts[0]?.id ?? '');
  const [cardId, setCardId] = useState(tx?.card_id ?? cards[0]?.id ?? '');
  const [installments, setInstallments] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState('');
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id ?? '');
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? '');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const flatCategories = flattenCategories(categories);
  const usingCard = type === 'expense' && payMethod === 'card';

  const save = async () => {
    const cents = parseAmountToCents(amount);
    if (!cents || cents <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      if (tx) {
        await updateTransaction(tx.id, { description, category_id: categoryId || null, amount_cents: cents, date });
      } else {
        const inst = parseInt(installments, 10);
        const body: TransactionCreate = {
          type,
          amount_cents: cents,
          date,
          account_id: usingCard ? undefined : accountId || undefined,
          card_id: usingCard ? cardId || undefined : undefined,
          to_account_id: type === 'transfer' ? toAccountId || undefined : undefined,
          category_id: type !== 'transfer' ? categoryId || undefined : undefined,
          description,
          installments: usingCard && inst >= 2 ? inst : undefined,
          invoice_month: usingCard && invoiceMonth.trim() ? invoiceMonth.trim() : undefined,
        };
        await createTransaction(body);
      }
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const clean = newCategory.trim();
    if (!clean) return;
    try {
      const c = await createCategory(clean);
      onCategoryCreated(c);
      setCategoryId(c.id);
      setNewCategory('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async () => {
    if (!tx) return;
    try {
      await deleteTransaction(tx.id);
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const field = fieldStyle;
  return (
    <Popup title={tx ? 'Edit transaction' : 'New transaction'} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        {!tx && (
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
            {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className="flex-1 text-sm px-3 py-1.5 rounded-md cursor-pointer capitalize"
                style={{ background: type === t ? 'var(--color-accent)' : 'transparent', color: type === t ? 'var(--color-on-accent)' : 'var(--color-text-secondary)' }}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Amount (R$)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
        </div>
        {!tx && type === 'expense' && cards.length > 0 && (
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
            {(['account', 'card'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setPayMethod(m)}
                className="flex-1 text-sm px-3 py-1.5 rounded-md cursor-pointer"
                style={{ background: payMethod === m ? 'var(--color-accent)' : 'transparent', color: payMethod === m ? 'var(--color-on-accent)' : 'var(--color-text-secondary)' }}>
                {m === 'account' ? 'Account' : 'Card'}
              </button>
            ))}
          </div>
        )}
        {!tx && (
          <div className="grid grid-cols-2 gap-3">
            {usingCard ? (
              <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Card
                <select value={cardId} onChange={(e) => setCardId(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {type === 'transfer' ? 'From' : 'Account'}
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            )}
            {type === 'transfer' ? (
              <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                To
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
                  <option value="">Choose…</option>
                  {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Category
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
                  <option value="">None</option>
                  {flatCategories.map((c) => <option key={c.id} value={c.id}>{c.indent ? ' ' : ''}{c.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {tx && tx.type !== 'transfer' && (
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer" style={field}>
              <option value="">None</option>
              {flatCategories.map((c) => <option key={c.id} value={c.id}>{c.indent ? ' ' : ''}{c.name}</option>)}
            </select>
          </label>
        )}
        {!tx && type !== 'transfer' && (
          <div className="flex gap-2">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addCategory()}
              placeholder="New category"
              className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
            <button type="button" onClick={() => void addCategory()} disabled={!newCategory.trim()}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              <Icon name="add-circle" size={15} />
            </button>
          </div>
        )}
        {!tx && usingCard && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Installments (optional)
              <input value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))} placeholder="1"
                className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Invoice (optional, YYYY-MM)
              <input value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} placeholder="Automatic"
                className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
            </label>
          </div>
        )}
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
          className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={field} />
        <div className="flex items-center justify-between mt-1">
          {tx ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5"
              style={{ color: 'var(--color-error)' }}>
              <Icon name="trash-bin-minimalistic" size={15} /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving}
              className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <Popup title="Delete this transaction?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>{tx?.description || formatCents(tx?.amount_cents ?? 0)}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            <button type="button" onClick={() => void remove()} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'var(--color-error)', color: '#fff' }}>Delete</button>
          </div>
        </Popup>
      )}
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Reports (unchanged scope — its own year navigator, no account filter since
// there is no owner-level grouping to filter by any more)
// ---------------------------------------------------------------------------

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A horizontal bar whose width is proportional to `value` out of `max`. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 9999 }} />
    </div>
  );
}

function ReportsPanel() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthly, setMonthly] = useState<MonthTotals[] | null>(null);
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [categoryReport, setCategoryReport] = useState<{ total_cents: number; categories: CategoryTotal[] } | null>(null);

  useEffect(() => {
    fetchMonthlyReport(year).then(setMonthly).catch(() => setMonthly([]));
  }, [year]);

  useEffect(() => {
    fetchCategoryReport(year, catType).then(setCategoryReport).catch(() => setCategoryReport(null));
  }, [year, catType]);

  const maxMonthly = Math.max(1, ...(monthly ?? []).flatMap((m) => [m.income_cents, m.expense_cents]));
  const yearNet = (monthly ?? []).reduce((sum, m) => sum + m.net_cents, 0);

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setYear((y) => y - 1)} className="composer-icon" aria-label="Previous year">
            <Icon name="alt-arrow-down" size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <span className="text-sm font-medium w-12 text-center" style={{ color: 'var(--color-text)' }}>{year}</span>
          <button type="button" onClick={() => setYear((y) => y + 1)} className="composer-icon" aria-label="Next year">
            <Icon name="alt-arrow-down" size={14} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
        <span className="text-sm" style={{ color: yearNet >= 0 ? 'var(--color-success, #34d399)' : 'var(--color-error)' }}>
          Net for {year}: {formatCents(yearNet)}
        </span>
      </div>

      <div className="finance-card">
        <div className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>Income vs expense, by month</div>
        <div className="flex flex-col gap-2">
          {monthly?.map((m, i) => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="text-xs w-8" style={{ color: 'var(--color-text-tertiary)' }}>{MONTH_LABELS[i]}</span>
              <Bar value={m.income_cents} max={maxMonthly} color="var(--color-success, #34d399)" />
              <Bar value={m.expense_cents} max={maxMonthly} color="var(--color-error)" />
              <span className="text-xs w-24 text-right" style={{ color: 'var(--color-text-secondary)' }}>{formatCents(m.net_cents)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>By category, {year}</div>
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setCatType(t)}
                className="text-xs px-2.5 py-1 rounded-md cursor-pointer capitalize"
                style={{ background: catType === t ? 'var(--color-accent)' : 'transparent', color: catType === t ? 'var(--color-on-accent)' : 'var(--color-text-secondary)' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {categoryReport && categoryReport.categories.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Nothing to show yet.</div>
          )}
          {categoryReport?.categories.map((c) => (
            <div key={c.category_id ?? 'none'} className="flex items-center gap-3">
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.name}</span>
              <Bar value={c.total_cents} max={categoryReport.categories[0]?.total_cents ?? 1} color="var(--color-accent-light)" />
              <span className="text-xs w-20 text-right" style={{ color: 'var(--color-text)' }}>{formatCents(c.total_cents)}</span>
              <span className="text-xs w-10 text-right" style={{ color: 'var(--color-text-tertiary)' }}>{c.share_pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type FinancesView = 'overview' | 'accounts' | 'reports';

export function FinancesPage() {
  const [overview, setOverview] = useState<{ banks: OverviewBank[]; cards: OverviewCard[] } | null>(null);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [view, setView] = useState<FinancesView>('overview');
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null | 'new'>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [historySort, setHistorySort] = useState<'desc' | 'asc'>('desc');
  const [month, setMonth] = useState(() => monthString());
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchOverview(month).then((r) => { setOverview(r); setAllAccounts(r.banks.flatMap((b) => b.accounts)); }).catch(() => setOverview({ banks: [], cards: [] }));
    fetchCards().then(setCards).catch(() => setCards([]));
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    const { start, end } = monthRange(month);
    fetchTransactions({ start, end, limit: 500 }).then(setTransactions).catch(() => setTransactions([]));
  }, [month]);

  useEffect(load, [load]);

  const categoryName = (id: string | null) => flattenCategories(categories).find((c) => c.id === id)?.name;
  const accountName = (id: string | null) => allAccounts.find((a) => a.id === id)?.name;
  const cardName = (id: string | null) => cards.find((c) => c.id === id)?.name;

  const selectedBankAccountIds = useMemo(() => {
    if (!selectedBankId || !overview) return null;
    const bank = overview.banks.find((b) => b.id === selectedBankId);
    return bank ? new Set(bank.accounts.map((a) => a.id)) : new Set<string>();
  }, [selectedBankId, overview]);

  const visibleTransactions = useMemo(() => {
    let items = transactions ?? [];
    if (historyFilter !== 'all') items = items.filter((t) => t.type === historyFilter);
    if (selectedBankAccountIds) {
      items = items.filter((t) => (t.account_id && selectedBankAccountIds.has(t.account_id)) || (t.to_account_id && selectedBankAccountIds.has(t.to_account_id)));
    }
    items = [...items].sort((a, b) => (historySort === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return items;
  }, [transactions, historyFilter, historySort, selectedBankAccountIds]);

  const HISTORY_FILTERS: { id: typeof historyFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'income', label: 'Income' },
    { id: 'expense', label: 'Expense' },
    { id: 'transfer', label: 'Transfer' },
  ];

  return (
    <div className="flex flex-col h-full px-6 py-5 gap-4 overflow-y-auto">
      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowCategories(true)} className="composer-icon" title="Categories">
            <Icon name="settings" size={18} />
          </button>
          <button type="button" onClick={() => setEditingTx('new')} disabled={allAccounts.length === 0} className="composer-send" title="New transaction">
            <Icon name="add-circle" size={18} />
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="pings-tab-pill">
          {(['overview', 'accounts', 'reports'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className="pings-tab-pill-item capitalize" data-active={view === v}>
              {v === 'overview' ? 'Overview' : v === 'accounts' ? 'Accounts' : 'Reports'}
            </button>
          ))}
        </div>
      </div>

      {/* The month navigator applies to Overview and History; it is inert on
          Accounts (nothing there is month-scoped) and hidden on Reports
          (which keeps its own year navigator), same precedent as TasksPage
          hiding its tab row in Calendar view. */}
      {view !== 'reports' && view !== 'accounts' && <MonthNav month={month} onChange={setMonth} />}

      {view === 'reports' && <ReportsPanel />}

      {view === 'accounts' && <AccountsPanel onOpenCard={setOpenCard} />}

      {view === 'overview' && (
        <>
          {overview !== null && overview.banks.length === 0 && overview.cards.length === 0 && (
            <div className="finance-card text-center py-8">
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                No banks or cards yet. Add one in the Accounts tab to start tracking money.
              </p>
              <button type="button" onClick={() => setView('accounts')}
                className="text-sm px-4 py-2 rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
                <Icon name="add-circle" size={15} /> Go to Accounts
              </button>
            </div>
          )}

          {overview && (overview.banks.length > 0 || overview.cards.length > 0) && (
            <div className="finance-card flex flex-col gap-0.5">
              {overview.banks.map((b) => (
                <BankOverviewRows key={b.id} bank={b} selected={selectedBankId === b.id} onSelect={setSelectedBankId} />
              ))}
              {overview.cards.map((c) => <CardOverviewRow key={c.id} card={c} onOpen={setOpenCard} />)}
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex flex-col items-center gap-2 mb-3">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {HISTORY_FILTERS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setHistoryFilter(f.id)} className="composer-chip" data-filled="true" data-active={historyFilter === f.id}>
                    {f.label}
                  </button>
                ))}
                <button type="button" onClick={() => setHistorySort((s) => (s === 'desc' ? 'asc' : 'desc'))}
                  className="composer-icon" aria-label={historySort === 'desc' ? 'Sort ascending' : 'Sort descending'}
                  title={historySort === 'desc' ? 'Newest first' : 'Oldest first'}>
                  <Icon name="alt-arrow-down" size={16} style={{ transform: historySort === 'asc' ? 'rotate(180deg)' : undefined }} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>History</span>
                {selectedBankId && (
                  <button type="button" onClick={() => setSelectedBankId(null)} className="composer-chip">
                    {overview?.banks.find((b) => b.id === selectedBankId)?.name} <Icon name="close-circle" size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
              {visibleTransactions.length === 0 && (
                <div className="text-xs px-1 py-3" style={{ color: 'var(--color-text-tertiary)' }}>No transactions this month.</div>
              )}
              {visibleTransactions.map((t) => {
                const editable = t.type !== 'invoice_payment';
                const label = t.description || (
                  t.type === 'transfer' ? `${accountName(t.account_id)} → ${accountName(t.to_account_id)}`
                  : t.type === 'invoice_payment' ? `${cardName(t.card_id)} invoice`
                  : categoryName(t.category_id) || 'Uncategorized'
                );
                return (
                  <button key={t.id} type="button" onClick={() => editable && setEditingTx(t)} className="tx-row" style={{ cursor: editable ? 'pointer' : 'default' }}>
                    <Icon name={TYPE_ICON[t.type].name} size={15} style={{ color: TYPE_ICON[t.type].color, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{label}</div>
                      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {formatDate(t.date)} · {t.card_id && t.type !== 'invoice_payment' ? cardName(t.card_id) : accountName(t.account_id)}
                        {t.installments_total ? ` · ${t.installment_no}/${t.installments_total}` : ''}
                      </div>
                    </div>
                    <span className="text-sm font-medium" style={{ color: t.type === 'expense' || t.type === 'invoice_payment' ? 'var(--color-error)' : t.type === 'income' ? 'var(--color-success, #34d399)' : 'var(--color-text)' }}>
                      {t.type === 'expense' || t.type === 'invoice_payment' ? '-' : t.type === 'income' ? '+' : ''}{formatCents(t.amount_cents)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {showCategories && <CategoriesPopup onClose={() => { setShowCategories(false); load(); }} />}
      {openCard && (
        <CardInvoicesPopup
          card={openCard}
          accounts={allAccounts}
          onClose={() => setOpenCard(null)}
          onChanged={load}
          onDeleted={() => { setOpenCard(null); load(); }}
        />
      )}
      {editingTx && (
        <TransactionForm
          accounts={allAccounts}
          cards={cards}
          categories={categories}
          tx={editingTx === 'new' ? null : editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); load(); }}
          onDeleted={() => { setEditingTx(null); load(); }}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
        />
      )}
    </div>
  );
}
