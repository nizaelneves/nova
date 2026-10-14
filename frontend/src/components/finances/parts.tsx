import { useEffect, useMemo, useRef, useState } from 'react';
import { curveCatmullRom } from '@visx/curve';
import { Icon, type IconName } from '../Icon';
import {
  type Category, type Goal, type Range, type SeriesPoint, type Slice, type Tx,
  money, parse, presetRange, rangeLabel,
} from '../../lib/finance/model';
import { Area } from '../charts/area';
import { ComposedChart } from '../charts/composed-chart';
import { Grid } from '../charts/grid';
import { Line } from '../charts/line';
import { SeriesBar } from '../charts/series-bar';
import { XAxis } from '../charts/x-axis';
import { ChartTooltip } from '../charts/tooltip';

const NUMBERS = /(R\$\s?[\d.]+,\d{2}|\d+%)/;

/** The summary sentence typed out like the island's terminal; amounts are coloured, the first by gain or loss. */
export function TerminalLine({ text }: { text: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(text.length); return; }
    setShown(0);
    let n = 0;
    const t = window.setInterval(() => { n += 1; setShown(n); if (n >= text.length) window.clearInterval(t); }, 18);
    return () => window.clearInterval(t);
  }, [text]);

  let first = true;
  let used = 0;
  const parts = text.split(NUMBERS).map((part, i) => {
    const visible = part.slice(0, Math.max(0, shown - used));
    used += part.length;
    if (!visible) return null;
    if (i % 2 === 0) return visible;
    const tone = first ? (text.includes('ahead') ? 'up' : 'down') : 'num';
    first = false;
    return <b key={i} className={`fin-num fin-num-${tone}`}>{visible}</b>;
  });

  return (
    <p className="fin-line" aria-label={text}>
      <span aria-hidden="true">❯</span>
      <span aria-hidden="true">{parts}<i className="tm-cursor" /></span>
    </p>
  );
}

// -- Section tabs: only the icon until hovered, then icon + label; the open one stays expanded --

export const TABS = [
  { id: 'Overview', icon: 'widget-2' },
  { id: 'Accounts', icon: 'wallet' },
  { id: 'Goals', icon: 'target' },
  { id: 'Transactions', icon: 'transfer-horizontal' },
  { id: 'Categories', icon: 'tag' },
] as const satisfies readonly { id: string; icon: IconName }[];
export type Tab = (typeof TABS)[number]['id'];

export function TabIcons({ tab, onChange, onAdd }: { tab: Tab; onChange: (t: Tab) => void; onAdd: () => void }) {
  return (
    <div className="fin-actions" role="tablist" aria-label="Finances sections">
      {TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id}
          className="fin-act" aria-label={t.id} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={16} />
          <span>{t.id}</span>
        </button>
      ))}
      <button type="button" className="fin-btn fin-add" onClick={onAdd}>
        <Icon name="add-circle" size={16} />
        Add
      </button>
    </div>
  );
}

// -- Date range ----------------------------------------------------------

const PRESETS: { id: Range['preset']; label: string }[] = [
  { id: '7d', label: 'Last 7 Days' },
  { id: '15d', label: 'Last 15 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'month', label: 'This Month' },
  { id: '3m', label: 'Last 3 Months' },
];

export function DateRangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const invalid = !from || !to || from > to;
  return (
    <div ref={ref} className="fin-range">
      <button type="button" className="fin-range-btn" onClick={() => { setFrom(range.from); setTo(range.to); setOpen(!open); }} aria-expanded={open}>
        <Icon name="calendar" size={16} />
        <span>{rangeLabel(range)}</span>
        <Icon name="alt-arrow-down" size={14} />
      </button>
      {open && (
        <div className="fin-range-pop" role="dialog" aria-label="Choose a period">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" data-active={range.preset === p.id} className="fin-range-item"
              onClick={() => { onChange(presetRange(p.id)); setOpen(false); }}>
              {p.label}
            </button>
          ))}
          <div className="fin-range-custom">
            <label>From<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
            <button type="button" className="fin-apply" disabled={invalid}
              onClick={() => { onChange({ preset: 'custom', from, to }); setOpen(false); }}>
              Apply dates
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Stat card -------------------------------------------------------------

export function StatCard({ label, icon, tone, value, delta, lowerIsBetter }: {
  label: string; icon: IconName; tone: 'cyan' | 'mint' | 'peach' | 'violet';
  value: number; delta: number | null; lowerIsBetter?: boolean;
}) {
  const good = delta === null ? true : lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <div className={`fin-card fin-stat fin-tone-${tone}`}>
      <span className="fin-stat-icon"><Icon name={icon} size={20} /></span>
      <p className="fin-stat-label">{label}</p>
      <p className="fin-stat-value">{money(value)}</p>
      <p className="fin-stat-foot">
        <span className={`fin-delta ${good ? 'up' : 'down'}`}>
          {delta === null ? 'new' : `${delta > 0 ? '+' : ''}${delta}%`}
        </span>
        <span>vs. last month</span>
      </p>
    </div>
  );
}

// -- Income vs expenses (Bklit composed chart) -------------------------------------

const smooth = curveCatmullRom.alpha(0.42);
const LEGEND = [['net', 'Net', '#10c3d3'], ['income', 'Income', '#20e7aa'], ['expenses', 'Expenses', '#ff6b6b']] as const;

export function IncomeVsExpenses({ series }: { series: SeriesPoint[] }) {
  const data = useMemo(() => series.map((p) => ({ ...p, date: parse(p.date) })), [series]);
  return (
    <div className="fin-card">
      <div className="fin-card-head">
        <h3>Income vs Expenses</h3>
        <span className="fin-legend"><i style={{ background: '#10c3d3' }} />Net<i style={{ background: '#20e7aa' }} />Income<i style={{ background: '#ff6b6b' }} />Expenses</span>
      </div>
      <ComposedChart data={data} xDataKey="date" aspectRatio="16 / 9" barGap={2} maxBarSize={26} margin={{ top: 16, right: 12, bottom: 32, left: 12 }}>
        <Grid horizontal numTicksRows={4} />
        <Area curve={smooth} dataKey="net" fill="#10c3d3" fillOpacity={0.16} />
        <SeriesBar dataKey="income" fill="#20e7aa" radius={5} />
        <SeriesBar dataKey="expenses" fill="#ff6b6b" radius={5} />
        <Line curve={smooth} dataKey="net" stroke="#10c3d3" />
        <ChartTooltip showCrosshair={false} dotSize={6} rows={(p) => LEGEND.map(([key, label, color]) => ({ color, label, value: money(Math.round((p[key] as number) * 100)) }))} />
        <XAxis numTicks={6} />
      </ComposedChart>
    </div>
  );
}

// -- Expense breakdown: one bubble per general category ---------------------------

interface Bubble { x: number; y: number; r: number }

/** Greedy circle packing: biggest first, each new circle touches the closest free spot. */
function pack(slices: Slice[]): { bubbles: Bubble[]; w: number; h: number } {
  const placed: Bubble[] = [];
  for (const s of slices) {
    const r = Math.sqrt(s.pct) * 10;
    if (!placed.length) { placed.push({ x: 0, y: 0, r }); continue; }
    let best: Bubble | null = null;
    for (const p of placed) {
      for (let a = 0; a < 360; a += 12) {
        const rad = (a * Math.PI) / 180;
        const c = { x: p.x + Math.cos(rad) * (p.r + r + 3), y: p.y + Math.sin(rad) * (p.r + r + 3), r };
        if (placed.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < q.r + r + 2.5)) continue;
        const score = Math.hypot(c.x, c.y * 1.4);
        if (!best || score < Math.hypot(best.x, best.y * 1.4)) best = c;
      }
    }
    placed.push(best ?? { x: 0, y: 0, r });
  }
  const minX = Math.min(...placed.map((b) => b.x - b.r));
  const maxX = Math.max(...placed.map((b) => b.x + b.r));
  const minY = Math.min(...placed.map((b) => b.y - b.r));
  const maxY = Math.max(...placed.map((b) => b.y + b.r));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { bubbles: placed.map((b) => ({ x: b.x - cx, y: b.y - cy, r: b.r })), w: maxX - minX, h: maxY - minY };
}

export function ExpenseBubbles({ slices, onView }: { slices: Slice[]; onView: () => void }) {
  const { bubbles, w, h } = useMemo(() => pack(slices), [slices]);
  return (
    <div className="fin-card">
      <div className="fin-card-head">
        <h3>Expense Breakdown</h3>
        <button type="button" className="fin-ghost" onClick={onView}>View Expenses</button>
      </div>
      {slices.length === 0 ? (
        <p className="fin-empty">No expenses in this period.</p>
      ) : (
        <>
          <svg viewBox={`${-w / 2 - 2} ${-h / 2 - 2} ${w + 4} ${h + 4}`} className="fin-bubbles" role="img" aria-label="Expense share by category">
            {bubbles.map((b, i) => (
              <g key={slices[i].id} className="fin-bubble" style={{ animationDelay: `${i * 70}ms` }}>
                <circle cx={b.x} cy={b.y} r={b.r} fill={slices[i].color} fillOpacity={0.16} stroke={slices[i].color} strokeOpacity={0.55} />
                {b.r > 9 && (
                  <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central" fill={slices[i].color} fontSize={Math.max(5, b.r * 0.34)} fontWeight={600}>
                    {Math.round(slices[i].pct)}%
                  </text>
                )}
              </g>
            ))}
          </svg>
          <ul className="fin-bubble-legend">
            {slices.slice(0, 4).map((s) => (
              <li key={s.id}><i style={{ background: s.color }} /><span>{s.name}</span><b>{money(s.value)}</b></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// -- Goals progress ---------------------------------------------------------------

export function GoalsProgress({ goals, onViewAll }: { goals: Goal[]; onViewAll?: () => void }) {
  return (
    <div className="fin-card">
      <div className="fin-card-head">
        <h3>Goals Progress</h3>
        {onViewAll && <button type="button" className="fin-ghost" onClick={onViewAll}>View All</button>}
      </div>
      <ul className="fin-goals">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
          return (
            <li key={g.id}>
              <div className="fin-goal-top"><b>{g.name}</b><span>{pct}%</span></div>
              <p>{money(g.saved)} / {money(g.target)}</p>
              <div className="fin-bar"><span style={{ width: `${pct}%`, background: g.color }} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// -- Transactions table ------------------------------------------------------------

const METHOD: Record<Tx['method'], string> = { cash: 'Cash', pix: 'Pix', debit: 'Debit', credit: 'Credit' };

export function TransactionsTable({ txs, cats, onViewAll }: { txs: Tx[]; cats: Category[]; onViewAll?: () => void }) {
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  return (
    <div className="fin-card">
      <div className="fin-card-head">
        <h3>Transactions</h3>
        {onViewAll && <button type="button" className="fin-ghost" onClick={onViewAll}>View All</button>}
      </div>
      {txs.length === 0 ? (
        <p className="fin-empty">No transactions in this period.</p>
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Method</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {txs.map((t) => {
                const c = byId.get(t.categoryId);
                const label = t.kind === 'savings' ? 'Savings' : t.kind === 'transfer' ? 'Transfer' : c?.name ?? 'Uncategorized';
                const tint = c?.color ?? (t.kind === 'savings' ? '#f6c38f' : '#94a3b8');
                const sign = t.kind === 'expense' ? '−' : t.kind === 'transfer' ? '⇄' : '+';
                return (
                  <tr key={t.id}>
                    <td>{parse(t.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>{t.description}</td>
                    <td><span className="fin-chip" style={{ color: tint, background: `${tint}22` }}>{label}</span></td>
                    <td>{METHOD[t.method]}</td>
                    <td className={`r fin-amt ${t.kind === 'expense' ? 'neg' : t.kind === 'transfer' ? '' : 'pos'}`}>{sign} {money(t.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
