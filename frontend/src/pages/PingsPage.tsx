import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../components/Icon';
import { Popup } from '../components/Popup';
import {
  Ping,
  PingCreate,
  PingsSettings,
  completePing,
  createPing,
  deletePing,
  fetchPings,
  fetchPingsSettings,
  savePingsSettings,
  snoozePing,
  updatePing,
} from '../lib/api';
import {
  WEEKDAY_CHIPS,
  backendDayToJsDay,
  formatCountdown,
  jsDayToBackendDay,
  pingDueDate,
  progressPercent,
  repeatSummary,
} from '../lib/pings';

function apiErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

/** Neutral marker for a ping's checkbox now that priority is not user-facing
 * (the field still exists on the backend, but nothing sets it to anything
 * other than "medium" from this UI, so a priority-colored dot would no
 * longer mean anything). */
const MARKER_COLOR = 'var(--color-text-tertiary)';

/** Plain-English recurrence label for a saved ping, e.g. "Repeats every 2
 * weeks on Mon, Wed, Fri" — reuses the same summary logic as the New Ping
 * modal so the two never describe the same rule differently. */
function pingRepeatLabel(ping: Ping): string {
  return repeatSummary(ping.date, {
    type: ping.repeat_type,
    interval: ping.repeat_interval,
    daysOfWeek: ping.repeat_days_of_week,
  });
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Shared little pieces (mirrors SettingsPage's own Section/SettingRow/Switch —
// not exported there, so kept as small local copies with the same look).
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>{title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 gap-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <div>
        <div className="text-sm" style={{ color: 'var(--color-text)' }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="relative w-11 h-6 rounded-full transition-colors disabled:opacity-60"
      style={{ background: on ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', cursor: disabled ? 'default' : 'pointer' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform bg-white"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
      />
    </button>
  );
}

const numberField = { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };

function NumberInput({ value, onChange, suffix, min = 0, max = 1440 }: { value: number; onChange: (n: number) => void; suffix: string; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-20 text-sm px-2 py-1.5 rounded-lg outline-none"
        style={numberField}
      />
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{suffix}</span>
    </div>
  );
}

function ComingSoonRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-3 gap-3 opacity-60" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <div>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
          {label}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
            Coming soon
          </span>
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{description}</div>
      </div>
      <Switch on={false} onClick={() => {}} label={label} disabled />
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Ping modal
// ---------------------------------------------------------------------------

function NewPingModal({
  presetRepeat,
  editPing,
  onClose,
  onCreated,
}: {
  presetRepeat: boolean;
  editPing?: Ping;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [text, setText] = useState(editPing?.text ?? '');
  const [repeatOn, setRepeatOn] = useState(editPing ? editPing.repeat_type !== 'none' : presetRepeat);
  const [repeatMode, setRepeatMode] = useState<'weekly' | 'monthly'>(
    editPing?.repeat_type === 'monthly' ? 'monthly' : 'weekly',
  );
  const [date, setDate] = useState(editPing?.date ?? todayLocal());
  const [time, setTime] = useState(editPing?.time ?? '09:00');
  const [interval, setInterval] = useState(editPing?.repeat_interval ?? 1);
  // Days of week in the backend's 0=Mon..6=Sun convention. Defaults to the
  // chosen date's own weekday, the same way Google Calendar pre-selects it.
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(() =>
    editPing && editPing.repeat_days_of_week.length > 0
      ? editPing.repeat_days_of_week
      : [jsDayToBackendDay(pingDueDate(editPing?.date ?? todayLocal(), '00:00').getDay())],
  );
  const [saving, setSaving] = useState(false);

  const toggleDay = (backendDay: number) => {
    setDaysOfWeek((cur) =>
      cur.includes(backendDay) ? cur.filter((d) => d !== backendDay) : [...cur, backendDay].sort((a, b) => a - b),
    );
  };

  const summary = repeatOn
    ? repeatSummary(date, { type: repeatMode, interval, daysOfWeek: repeatMode === 'weekly' ? daysOfWeek : undefined })
    : '';

  const save = async () => {
    const clean = text.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const body: PingCreate = {
        text: clean,
        date,
        time,
        repeat_type: repeatOn ? repeatMode : 'none',
        repeat_interval: repeatOn ? interval : 1,
        repeat_days_of_week: repeatOn && repeatMode === 'weekly' ? daysOfWeek : [],
      };
      if (editPing) {
        await updatePing(editPing.id, body);
      } else {
        await createPing(body);
      }
      onCreated();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const field = { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };

  return (
    <Popup title={editPing ? 'Edit Ping' : 'New Ping'} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What should I remind you of?"
          className="w-full text-sm px-3 py-2 rounded-lg outline-none"
          style={field}
        />

        <div className="flex items-center justify-between py-1">
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>How Often</span>
          <Switch on={repeatOn} onClick={() => setRepeatOn((v) => !v)} label="How Often" />
        </div>

        {repeatOn && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1 p-0.5 rounded-lg w-fit" style={{ background: 'var(--color-bg-secondary)' }}>
              {(['weekly', 'monthly'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRepeatMode(mode)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    background: repeatMode === mode ? 'var(--color-accent)' : 'transparent',
                    color: repeatMode === mode ? 'var(--color-on-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {mode === 'weekly' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Every</span>
              <input
                type="number"
                min={1}
                value={interval}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setInterval(Number.isNaN(n) ? 1 : Math.max(1, n));
                }}
                className="w-16 text-sm px-2 py-1 rounded-lg outline-none"
                style={field}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {repeatMode === 'weekly' ? (interval === 1 ? 'week' : 'weeks') : interval === 1 ? 'month' : 'months'}
              </span>
            </div>

            {repeatMode === 'weekly' && (
              <div className="flex gap-1">
                {WEEKDAY_CHIPS.map((label, jsDay) => {
                  const backendDay = jsDayToBackendDay(jsDay);
                  const on = daysOfWeek.includes(backendDay);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(backendDay)}
                      aria-pressed={on}
                      className="w-8 h-8 rounded-full text-xs font-medium cursor-pointer transition-colors"
                      style={{
                        background: on ? 'var(--color-accent)' : 'var(--color-bg)',
                        color: on ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      }}
                    >
                      {label[0]}
                    </button>
                  );
                })}
              </div>
            )}

            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{summary}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg outline-none" style={field} />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button type="button" onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={!text.trim() || saving}
            className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
            {saving ? (editPing ? 'Saving…' : 'Creating…') : editPing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Up next hero card
// ---------------------------------------------------------------------------

function UpNextCard({ ping, onChanged }: { ping: Ping; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const due = pingDueDate(ping.date, ping.time);
  const start = new Date(ping.created_at);
  const now = new Date();

  const act = async (fn: () => Promise<Ping>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong, var(--color-border))' }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-accent-light)' }}>Up next</span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, {ping.time}
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: MARKER_COLOR, flexShrink: 0 }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{ping.text}</h2>
      </div>
      <div className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>{formatCountdown(due, now)}</div>

      <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--color-bg-tertiary)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${progressPercent(start, due, now)}%`, background: 'var(--color-accent)', transition: 'width 300ms ease' }}
        />
      </div>

      {open && (
        <div className="text-xs mb-3 flex flex-col gap-1" style={{ color: 'var(--color-text-tertiary)' }}>
          <span>{ping.repeat_type === 'none' ? "Doesn't repeat" : pingRepeatLabel(ping)}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void act(() => completePing(ping.id))}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
          <Icon name="check-circle" size={15} /> Complete
        </button>
        <button type="button" disabled={busy} onClick={() => void act(() => snoozePing(ping.id))}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          <Icon name="clock-circle" size={15} /> Snooze
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          <Icon name="eye" size={15} /> {open ? 'Close' : 'Open'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pings tab
// ---------------------------------------------------------------------------

type ListFilter = 'all' | 'week' | 'month' | 'recurring';

function PingsTab() {
  const [pings, setPings] = useState<Ping[] | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [showModal, setShowModal] = useState<false | 'plain'>(false);
  const [editingPing, setEditingPing] = useState<Ping | null>(null);

  const load = useCallback(() => {
    fetchPings().then(setPings).catch(() => setPings([]));
  }, []);
  useEffect(load, [load]);

  const toggleComplete = async (ping: Ping) => {
    try {
      await completePing(ping.id);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async (ping: Ping) => {
    try {
      await deletePing(ping.id);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const { open, nextUp } = useMemo(() => {
    const all = pings ?? [];
    const openPings = all.filter((p) => !p.completed);
    const withDue = openPings.map((p) => ({ p, due: pingDueDate(p.date, p.time) }));
    withDue.sort((a, b) => a.due.getTime() - b.due.getTime());
    return { open: openPings, nextUp: withDue[0]?.p ?? null };
  }, [pings]);

  const visible = useMemo(() => {
    const now = new Date();
    let items = open;
    if (listFilter === 'week') {
      const limit = new Date(now.getTime() + 7 * 86_400_000);
      items = items.filter((p) => pingDueDate(p.date, p.time) <= limit);
    } else if (listFilter === 'month') {
      const monthAhead = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      items = items.filter((p) => pingDueDate(p.date, p.time) <= monthAhead);
    } else if (listFilter === 'recurring') {
      items = items.filter((p) => p.repeat_type !== 'none');
    }
    const groups = new Map<string, Ping[]>();
    for (const p of [...items].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))) {
      const list = groups.get(p.date) ?? [];
      list.push(p);
      groups.set(p.date, list);
    }
    return Array.from(groups.entries());
  }, [open, listFilter]);

  if (pings === null) {
    return <div className="text-sm px-1" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  }

  if (pings.length === 0) {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <Icon name="bell" size={30} style={{ color: 'var(--color-text-tertiary)' }} />
          </div>
          <button type="button" onClick={() => setShowModal('plain')}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
            <Icon name="add-circle" size={17} /> New Ping
          </button>
        </div>
        {showModal && (
          <NewPingModal presetRepeat={false} onClose={() => setShowModal(false)}
            onCreated={() => { setShowModal(false); load(); }} />
        )}
      </>
    );
  }

  const FILTERS: { id: ListFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'recurring', label: 'Recurring' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button type="button" onClick={() => setShowModal('plain')}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
          <Icon name="add-circle" size={16} /> New Ping
        </button>
      </div>

      {nextUp && <UpNextCard ping={nextUp} onChanged={load} />}

      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setListFilter(f.id)}
              className="composer-chip"
              data-filled="true"
              data-active={listFilter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {visible.length === 0 && (
            <div className="text-xs px-1 py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>Nothing here.</div>
          )}
          {visible.map(([day, items]) => (
            <div key={day} className="flex flex-col gap-1.5">
              <div className="text-xs font-medium px-1" style={{ color: 'var(--color-text-tertiary)' }}>
                {pingDueDate(day, '00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              {items.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    aria-label={p.completed ? 'Mark not done' : 'Mark done'}
                    onClick={() => void toggleComplete(p)}
                    className="w-4 h-4 rounded-full shrink-0 cursor-pointer"
                    style={{ border: `2px solid ${MARKER_COLOR}`, background: p.completed ? MARKER_COLOR : 'transparent' }}
                  />
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-text)' }}>{p.text}</span>
                  <span className="task-chip">{p.time}</span>
                  <button type="button" aria-label="Edit ping" onClick={() => setEditingPing(p)}
                    className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                    <Icon name="pen" size={14} />
                  </button>
                  <button type="button" aria-label="Delete ping" onClick={() => void remove(p)}
                    className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-error)' }}>
                    <Icon name="trash-bin-minimalistic" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <NewPingModal presetRepeat={false} onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load(); }} />
      )}
      {editingPing && (
        <NewPingModal presetRepeat={false} editPing={editingPing} onClose={() => setEditingPing(null)}
          onCreated={() => { setEditingPing(null); load(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function PingsSettingsTab() {
  const [settings, setSettings] = useState<PingsSettings | null>(null);

  const reload = useCallback(() => {
    fetchPingsSettings().then(setSettings).catch(() => setSettings(null));
  }, []);
  useEffect(reload, [reload]);

  const change = async (changes: Partial<PingsSettings>) => {
    try {
      setSettings(await savePingsSettings(changes));
    } catch (err) {
      toast.error(apiErrorMessage(err));
      reload();
    }
  };

  if (!settings) {
    return <div className="text-sm px-1" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <Section title="General">
        <SettingRow label="Ping notifications" description="Master switch for every Ping reminder below.">
          <Switch on={settings.notifications_enabled} label="Ping notifications"
            onClick={() => void change({ notifications_enabled: !settings.notifications_enabled })} />
        </SettingRow>
      </Section>

      <Section title="Where you receive them">
        <SettingRow label="In app" description="Free · always on">
          <Switch on={true} onClick={() => {}} label="In app" disabled />
        </SettingRow>
        <SettingRow label="Browser" description="Browser notifications while Phibe is open">
          <Switch on={settings.browser_enabled} label="Browser"
            onClick={() => void change({ browser_enabled: !settings.browser_enabled })} />
        </SettingRow>
        <SettingRow label="Notify before the time" description="How far ahead of the due time to notify by default">
          <NumberInput value={settings.default_lead_minutes} suffix="min before"
            onChange={(n) => void change({ default_lead_minutes: n })} min={0} max={1440} />
        </SettingRow>
        <ComingSoonRow label="Telegram" description="Get pinged in your Telegram chat with Phibe." />
        <ComingSoonRow label="WhatsApp" description="Get pinged over WhatsApp." />
      </Section>

      <Section title="Automatic pings">
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          Phibe nudges you automatically when something's coming up. Each module has its own lead time.
        </p>
        <SettingRow label="Tasks" description="Nudge before a task's due time, however far ahead you choose.">
          <div className="flex items-center gap-3">
            <NumberInput value={settings.tasks_lead_minutes} suffix="min before"
              onChange={(n) => void change({ tasks_lead_minutes: n })} min={0} max={1440} />
            <Switch on={settings.tasks_reminders_enabled} label="Tasks reminders"
              onClick={() => void change({ tasks_reminders_enabled: !settings.tasks_reminders_enabled })} />
          </div>
        </SettingRow>
        <SettingRow label="Finances" description="Bill or invoice coming up? Get notified days ahead.">
          <div className="flex items-center gap-3">
            <NumberInput value={settings.finances_lead_days} suffix="days before"
              onChange={(n) => void change({ finances_lead_days: n })} min={0} max={90} />
            <Switch on={settings.finances_reminders_enabled} label="Finances reminders"
              onClick={() => void change({ finances_reminders_enabled: !settings.finances_reminders_enabled })} />
          </div>
        </SettingRow>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageTab = 'pings' | 'settings';

export function PingsPage() {
  const [tab, setTab] = useState<PageTab>('pings');

  return (
    <div className="flex flex-col h-full px-6 py-5 gap-4 overflow-y-auto">
      <div className="flex justify-center">
        <div className="pings-tab-pill">
          {([['pings', 'Pings'], ['settings', 'Settings']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="pings-tab-pill-item" data-active={tab === id}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pings' ? <PingsTab /> : <PingsSettingsTab />}
    </div>
  );
}
