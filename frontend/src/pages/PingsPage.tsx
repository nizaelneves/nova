import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../components/Icon';
import { Popup } from '../components/Popup';
import { ConfirmDelete } from '../components/finances/forms';
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
  formatCountdown,
  isoDay,
  jsDayToBackendDay,
  occursOn,
  pingDueDate,
  progressPercent,
  repeatSummary,
} from '../lib/pings';

function apiErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

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
      style={{ background: on ? 'var(--color-accent)' : 'rgba(255,255,255,0.16)', cursor: disabled ? 'default' : 'pointer' }}
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

// ---------------------------------------------------------------------------
// New Ping modal
// ---------------------------------------------------------------------------

function NewPingModal({
  presetDate,
  presetTime,
  editPing,
  onClose,
  onCreated,
}: {
  presetDate?: string;
  presetTime?: string;
  editPing?: Ping;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [text, setText] = useState(editPing?.text ?? '');
  const [repeatOn, setRepeatOn] = useState(editPing ? editPing.repeat_type !== 'none' : false);
  const [repeatMode, setRepeatMode] = useState<'weekly' | 'monthly'>(
    editPing?.repeat_type === 'monthly' ? 'monthly' : 'weekly',
  );
  const [date, setDate] = useState(editPing?.date ?? presetDate ?? todayLocal());
  const [time, setTime] = useState(editPing?.time ?? presetTime ?? '09:00');
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
// Cards
// ---------------------------------------------------------------------------

type Status = 'overdue' | 'today' | 'upcoming' | 'done';

const STATUS: Record<Status, { label: string; icon: IconName }> = {
  overdue: { label: 'Overdue', icon: 'danger-triangle' },
  today: { label: 'Today', icon: 'bolt' },
  upcoming: { label: 'Upcoming', icon: 'clock-circle' },
  done: { label: 'Completed', icon: 'check-circle' },
};

function statusOf(ping: Ping, now: Date): Status {
  if (ping.completed) return 'done';
  const due = pingDueDate(ping.date, ping.time);
  if (due < now) return 'overdue';
  return isoDay(due) === isoDay(now) ? 'today' : 'upcoming';
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PingCard = memo(function PingCard({ ping, now, onChanged, onEdit, onDelete }: {
  ping: Ping; now: Date; onChanged: () => void; onEdit: (p: Ping) => void; onDelete: (p: Ping) => void;
}) {
  const [busy, setBusy] = useState(false);
  const due = pingDueDate(ping.date, ping.time);
  const status = statusOf(ping, now);
  const done = status === 'done';

  const act = async (fn: () => Promise<unknown>) => {
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
    <article className="pg-card" data-status={status}>
      <div className="pg-card-top">
        <span className="pg-status"><Icon name={STATUS[status].icon} size={14} />{STATUS[status].label}</span>
        {ping.repeat_type !== 'none' && (
          <span className="pg-rep" title={pingRepeatLabel(ping)}><Icon name="repeat" size={12} />{ping.repeat_type === 'weekly' ? 'Weekly' : 'Monthly'}</span>
        )}
      </div>
      <h4 className="pg-card-title">{ping.text}</h4>
      {!done && (
        <div className="pg-track">
          <i /><b><u style={{ width: `${progressPercent(new Date(ping.created_at), due, now)}%` }} /></b><i />
        </div>
      )}
      <div className="pg-card-dates">
        <span>{done ? 'Done' : formatCountdown(due, now)}</span>
        <span>{shortDate(due)}, {ping.time}</span>
      </div>
      <div className="pg-card-foot">
        {done ? <span /> : (
          <button type="button" className="pg-done" disabled={busy} onClick={() => void act(() => completePing(ping.id))}>
            <Icon name="check-circle" size={15} /> Complete
          </button>
        )}
        <div className="pg-icons">
          {!done && <button type="button" aria-label="Snooze ping" title="Snooze" disabled={busy} onClick={() => void act(() => snoozePing(ping.id))}><Icon name="clock-circle" size={15} /></button>}
          <button type="button" aria-label="Edit ping" title="Edit" onClick={() => onEdit(ping)}><Icon name="pen" size={15} /></button>
          <button type="button" aria-label="Delete ping" title="Delete" disabled={busy} onClick={() => onDelete(ping)}><Icon name="trash-bin-minimalistic" size={15} /></button>
        </div>
      </div>
    </article>
  );
});

// ---------------------------------------------------------------------------
// Calendar (week, Sunday to Saturday, with an hour grid)
// ---------------------------------------------------------------------------

const HOUR = 64; // px per hour
const EVENT_H = 54;
const EVENT_MIN = (EVENT_H / HOUR) * 60; // minutes an event box covers, for overlap checks

function sundayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Side-by-side lanes for events that would overlap on screen. */
function layoutDay(items: Ping[]): { ping: Ping; lane: number; lanes: number }[] {
  const out: { ping: Ping; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let laneEnds: number[] = [];
  const close = () => { cluster.forEach((c) => { c.lanes = laneEnds.length; }); out.push(...cluster); cluster = []; laneEnds = []; };
  for (const ping of [...items].sort((a, b) => a.time.localeCompare(b.time))) {
    const start = minutesOf(ping.time);
    if (laneEnds.length && Math.max(...laneEnds) <= start) close();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = start + EVENT_MIN;
    cluster.push({ ping, lane, lanes: 1 });
  }
  close();
  return out;
}

function WeekCalendar({ pings, now, onEdit, onDelete, onAdd }: {
  pings: Ping[]; now: Date; onEdit: (p: Ping) => void; onDelete: (p: Ping) => void; onAdd: (day: string, time: string) => void;
}) {
  const [start, setStart] = useState(() => sundayOf(new Date()));
  const scroller = useRef<HTMLDivElement>(null);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
    [start],
  );
  const columns = useMemo(
    () => days.map((day) => ({ iso: isoDay(day), items: layoutDay(pings.filter((p) => occursOn(p, day))) })),
    [days, pings],
  );
  const end = days[6];
  const today = isoDay(now);
  const shift = (weeks: number) => setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + weeks * 7));
  const endLabel = end.toLocaleDateString('en-US', start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' });

  // open near the current hour, like Google Calendar
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (new Date().getHours() - 1) * HOUR);
  }, []);

  const addAt = (iso: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const half = Math.min(47, Math.floor((y / HOUR) * 2));
    onAdd(iso, `${String(Math.floor(half / 2)).padStart(2, '0')}:${half % 2 ? '30' : '00'}`);
  };

  return (
    <div>
      <div className="pg-weeknav">
        <h3>{shortDate(start)} – {endLabel}, {end.getFullYear()}</h3>
        <div className="pg-weeknav-btns">
          <button type="button" aria-label="Previous week" onClick={() => shift(-1)}><Icon name="alt-arrow-down" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
          <button type="button" className="pg-today" disabled={isoDay(start) === isoDay(sundayOf(now))} onClick={() => setStart(sundayOf(new Date()))}>Today</button>
          <button type="button" aria-label="Next week" onClick={() => shift(1)}><Icon name="alt-arrow-down" size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
        </div>
      </div>

      <div className="pg-cal" ref={scroller}>
        <div className="pg-cal-inner">
          <div className="pg-cal-head">
            <span />
            {days.map((day) => (
              <div key={day.getTime()} className="pg-cal-dayhead" data-today={isoDay(day) === today}>
                <span>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <b>{day.getDate()}</b>
              </div>
            ))}
          </div>

          <div className="pg-cal-body" style={{ height: 24 * HOUR, '--hour': `${HOUR}px` } as React.CSSProperties}>
            <div className="pg-cal-hours">
              {Array.from({ length: 23 }, (_, i) => (
                <span key={i} style={{ top: (i + 1) * HOUR }}>{hourLabel(i + 1)}</span>
              ))}
            </div>
            {columns.map(({ iso, items }) => (
              <div key={iso} className="pg-cal-col" onClick={(e) => addAt(iso, e)}>
                {items.map(({ ping: p, lane, lanes }) => (
                  <div key={p.id} className="pg-event-wrap" style={{
                    top: (minutesOf(p.time) / 60) * HOUR, height: EVENT_H,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
                  }}>
                    <button type="button" className="pg-event" data-done={p.completed}
                      data-late={!p.completed && pingDueDate(iso, p.time) < now} onClick={() => onEdit(p)}>
                      <span className="pg-event-time">{p.time}{p.repeat_type !== 'none' && <Icon name="repeat" size={11} />}</span>
                      <span className="pg-event-text">{p.text}</span>
                    </button>
                    <button type="button" className="pg-event-del" aria-label="Delete ping" title="Delete" onClick={() => onDelete(p)}>
                      <Icon name="trash-bin-minimalistic" size={13} />
                    </button>
                  </div>
                ))}
                {iso === today && <div className="pg-cal-now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pings view
// ---------------------------------------------------------------------------

type ListFilter = 'all' | 'upcoming' | 'month' | 'overdue' | 'recurring' | 'completed';
type View = 'cards' | 'calendar' | 'settings';
type Adding = { date?: string; time?: string } | null;

const FILTERS: { id: ListFilter; label: string; empty: string }[] = [
  { id: 'all', label: 'All', empty: 'No open pings.' },
  { id: 'upcoming', label: 'Upcoming', empty: 'No upcoming pings.' },
  { id: 'month', label: 'Month', empty: 'No pings this month.' },
  { id: 'overdue', label: 'Overdue', empty: "You're all caught up." },
  { id: 'recurring', label: 'Recurring', empty: 'No recurring pings.' },
  { id: 'completed', label: 'Completed', empty: 'No completed pings yet.' },
];

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'cards', label: 'Cards', icon: 'layers' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function matches(p: Ping, filter: ListFilter, now: Date): boolean {
  if (filter === 'completed') return p.completed;
  if (p.completed) return false;
  const due = pingDueDate(p.date, p.time);
  switch (filter) {
    case 'upcoming': return due >= now;
    case 'month': return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth();
    case 'overdue': return due < now;
    case 'recurring': return p.repeat_type !== 'none';
    default: return true;
  }
}

function summarize(open: Ping[], now: Date): string {
  if (open.length === 0) return 'Nothing scheduled.';
  const late = open.filter((p) => pingDueDate(p.date, p.time) < now).length;
  return late ? `${open.length - late} coming up · ${late} overdue` : `${open.length} coming up`;
}

function PingsView({ pings, now, view, adding, onAdd, onAddClose, reload }: {
  pings: Ping[];
  now: Date;
  view: 'cards' | 'calendar';
  adding: Adding;
  onAdd: (day?: string, time?: string) => void;
  onAddClose: () => void;
  reload: () => void;
}) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [editing, setEditing] = useState<Ping | null>(null);
  const [deleting, setDeleting] = useState<Ping | null>(null);

  const visible = useMemo(
    () => pings.filter((p) => matches(p, filter, now)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [pings, filter, now],
  );

  const remove = async (p: Ping) => {
    try {
      await deletePing(p.id);
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const created = () => { onAddClose(); reload(); };
  const edited = () => { setEditing(null); reload(); };

  return (
    <>
      {pings.length === 0 && view === 'cards' ? null : (
        <>
          {pings.length > 0 && <div className="pg-filters">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className="pg-filter" data-active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>}
          {view === 'cards' ? (
            visible.length === 0 ? (
              <div className="fin-empty">{FILTERS.find((f) => f.id === filter)?.empty}</div>
            ) : (
              <div className="pg-grid">
                {visible.map((p) => (
                  <PingCard key={p.id} ping={p} now={now} onChanged={reload} onEdit={setEditing} onDelete={setDeleting} />
                ))}
              </div>
            )
          ) : (
            <WeekCalendar pings={visible} now={now} onEdit={setEditing} onDelete={setDeleting} onAdd={onAdd} />
          )}
        </>
      )}

      {adding && <NewPingModal presetDate={adding.date} presetTime={adding.time} onClose={onAddClose} onCreated={created} />}
      {editing && <NewPingModal editPing={editing} onClose={() => setEditing(null)} onCreated={edited} />}
      {deleting && (
        <ConfirmDelete title="Delete Ping" message={`Delete "${deleting.text}"? This can't be undone.`}
          onConfirm={() => void remove(deleting)} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings view
// ---------------------------------------------------------------------------

const LEADS = [5, 15, 30, 60];

function SetRow({ icon, title, text, soon, children }: { icon: IconName; title: string; text: string; soon?: boolean; children?: React.ReactNode }) {
  return (
    <div className="fin-acct pg-set" data-soon={soon}>
      <div className="fin-acct-main">
        <span className="pg-set-icon"><Icon name={icon} size={20} /></span>
        <div className="fin-acct-name">
          <h4>{title}{soon && <em className="pg-soon">Coming soon</em>}</h4>
          <p>{text}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

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

  if (!settings) return <div className="fin-empty">Loading…</div>;

  const off = !settings.notifications_enabled;
  const lead = settings.lead_enabled && !off;

  return (
    <div className="fin-acct-list pg-settings">
      <SetRow icon="bell" title="Ping Notifications" text="Turn every ping reminder on or off.">
        <Switch on={!off} label="Ping Notifications" onClick={() => void change({ notifications_enabled: off })} />
      </SetRow>
      <SetRow icon="monitor-smartphone" title="Floating Button" text="Show pings on Phibe's floating button.">
        <Switch on={settings.floating_button_enabled} label="Floating Button" disabled={off}
          onClick={() => void change({ floating_button_enabled: !settings.floating_button_enabled })} />
      </SetRow>
      <div className="fin-acct pg-set">
        <div className="fin-acct-main">
          <span className="pg-set-icon"><Icon name="clock-circle" size={20} /></span>
          <div className="fin-acct-name">
            <h4>Notify Before</h4>
            <p>Get a heads-up ahead of the due time.</p>
          </div>
          <Switch on={settings.lead_enabled} label="Notify Before" disabled={off}
            onClick={() => void change({ lead_enabled: !settings.lead_enabled })} />
        </div>
        {settings.lead_enabled && (
          <div className="pg-lead" data-off={!lead}>
            {LEADS.map((m) => (
              <button key={m} type="button" className="pg-filter" data-active={settings.default_lead_minutes === m} disabled={!lead}
                onClick={() => void change({ default_lead_minutes: m })}>
                {m} min
              </button>
            ))}
            <NumberInput value={settings.default_lead_minutes} suffix="min" min={1} max={1440}
              onChange={(n) => void change({ default_lead_minutes: n })} />
          </div>
        )}
      </div>
      <SetRow icon="plain-2" title="Telegram" text="Get pinged over Telegram." soon>
        <Switch on={false} onClick={() => {}} label="Telegram" disabled />
      </SetRow>
      <SetRow icon="phone-calling" title="WhatsApp" text="Get pinged over WhatsApp." soon>
        <Switch on={false} onClick={() => {}} label="WhatsApp" disabled />
      </SetRow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PingsIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 84 84" role="img" aria-label="Pings">
      <rect width="84" height="84" rx="22" fill="#14123f" />
      <circle cx="40" cy="17" r="3.5" fill="#10c3d3" />
      <path d="M40 20c-10 0-16 8-16 18v10l-5 8h42l-5-8V38c0-10-6-18-16-18z" fill="#10c3d3" />
      <path d="M34 60a6 6 0 0 0 12 0z" fill="#ffe3bd" />
      <circle cx="62" cy="24" r="9" fill="#ffe3bd" stroke="#14123f" stroke-width="4" />
    </svg>
  );
}

/** The current time, refreshed every minute so "overdue" and the now-line stay right. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function PingsPage() {
  const [view, setView] = useState<View>('cards');
  const [adding, setAdding] = useState<Adding>(null);
  const [pings, setPings] = useState<Ping[] | null>(null);
  const now = useNow();

  const reload = useCallback(() => {
    fetchPings().then(setPings).catch(() => setPings([]));
  }, []);
  useEffect(reload, [reload]);

  const open = useMemo(() => (pings ?? []).filter((p) => !p.completed), [pings]);

  return (
    <div className="fin-root pg-root h-full overflow-y-auto">
      <div className="fin-wrap">
        <header className="fin-header">
          <div className="fin-hello">
            <PingsIcon />
            <div>
              <h2>Pings</h2>
              <p>{pings ? summarize(open, now) : ' '}</p>
            </div>
          </div>
          <div className="fin-controls">
            <div className="fin-actions" role="tablist" aria-label="Pings views">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={view === v.id} data-active={view === v.id}
                  className="fin-act" aria-label={v.label} onClick={() => setView(v.id)}>
                  <Icon name={v.icon} size={16} />
                  <span>{v.label}</span>
                </button>
              ))}
              <button type="button" className="fin-btn fin-add" onClick={() => setAdding({})}>
                <Icon name="add-circle" size={16} /> New Ping
              </button>
            </div>
          </div>
        </header>

        {view === 'settings' ? <PingsSettingsTab />
          : pings === null ? <div className="fin-empty">Loading…</div>
          : <PingsView pings={pings} now={now} view={view} adding={adding} reload={reload}
              onAdd={(date, time) => setAdding({ date, time })} onAddClose={() => setAdding(null)} />}
      </div>
    </div>
  );
}
