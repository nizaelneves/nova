import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { groupItems, itemsByDate, monthGrid, nextStage, subProgress } from '../../lib/board-view';
import { downloadFile, fetchBoardFiles, type BoardFile, type Item, type Property } from '../../lib/boards-api';

/** Cards in one column per option of a status/select property; drag a card, or use its arrow, to change stage. */
export function KanbanView({ items, all, props, groupProp, onSet, onOpen, onAdd }: {
  items: Item[];
  all: Item[];
  props: Property[];
  groupProp: Property;
  onSet: (item: Item, option: string | null) => void;
  onOpen: (id: string) => void;
  onAdd: (title: string, option: string | null) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [adds, setAdds] = useState<Record<string, string>>({});
  const groups = groupItems(items, props, groupProp.id);
  const date = props.find((p) => p.type === 'date');
  const tags = props.find((p) => p.type === 'tags');
  return (
    <div className="bd-kanban">
      {groups.map((g) => (
        <section key={g.key} className="bd-col" data-over={over === g.key || undefined} style={{ ['--g' as string]: g.color ?? 'var(--color-text-tertiary)' }}
          onDragOver={(e) => { e.preventDefault(); setOver(g.key); }} onDragLeave={() => setOver((o) => (o === g.key ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const item = all.find((i) => i.id === e.dataTransfer.getData('text/plain'));
            if (item && (item.values[groupProp.id] ?? '') !== g.key) onSet(item, g.key || null);
          }}>
          <h4><i />{g.label}<span>{g.items.length}</span></h4>
          {g.items.map((i) => {
            const next = groupProp.type === 'status' ? nextStage(groupProp, i.values[groupProp.id]) : null;
            const prog = subProgress(all, props, i.id);
            const when = date ? String(i.values[date.id] ?? '') : '';
            const chosen = tags && Array.isArray(i.values[tags.id]) ? (i.values[tags.id] as string[]) : [];
            return (
              <article key={i.id} className="bd-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)}>
                <button type="button" className="bd-title" onClick={() => onOpen(i.id)}>{i.title}</button>
                <div className="bd-meta">
                  {when && <span>{when}</span>}
                  {prog.total > 0 && <span>{prog.done}/{prog.total}</span>}
                  {tags && chosen.map((id) => { const o = tags.options.find((x) => x.id === id); return o ? <span key={id} className="bd-chip" style={{ background: o.color }}>{o.label}</span> : null; })}
                  {next && <button type="button" className="bd-adv" title={`Move to ${next.label}`} aria-label={`Move ${i.title} to ${next.label}`} onClick={() => onSet(i, next.id)}>{next.label} →</button>}
                </div>
              </article>
            );
          })}
          <input className="bd-colAdd" value={adds[g.key] ?? ''} placeholder="+ Add item" aria-label={`Add item to ${g.label}`} onChange={(e) => setAdds({ ...adds, [g.key]: e.target.value })}
            onKeyDown={(e) => {
              const title = (adds[g.key] ?? '').trim();
              if (e.key !== 'Enter' || !title) return;
              onAdd(title, g.key || null);
              setAdds({ ...adds, [g.key]: '' });
            }} />
        </section>
      ))}
    </div>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A month grid of the items that have a date in the chosen date property. */
export function CalendarView({ items, dateProp, dateOptions, onDateProp, onOpen, onCreate }: {
  items: Item[];
  dateProp: Property | undefined;
  dateOptions: Property[];
  onDateProp: (id: string) => void;
  onOpen: (id: string) => void;
  onCreate: (date: string) => void;
}) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const byDate = useMemo(() => itemsByDate(items, dateProp?.id), [items, dateProp]);
  const step = (n: number) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!dateProp) return <div className="bd-empty-state"><p>Add a Date property to see items on the calendar.</p></div>;
  return (
    <div className="bd-cal">
      <div className="bd-calhead">
        <button type="button" className="bd-btn" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
        <b>{new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button type="button" className="bd-btn" aria-label="Next month" onClick={() => step(1)}>›</button>
        <button type="button" className="bd-btn" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
        {dateOptions.length > 1 && (
          <label className="tt-select"><span>By</span>
            <select value={dateProp.id} onChange={(e) => onDateProp(e.target.value)}>{dateOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
        )}
      </div>
      <div className="bd-calgrid">
        {WEEKDAYS.map((d) => <span key={d} className="bd-wd">{d}</span>)}
        {grid.map((day) => (
          <div key={day} className="bd-day" data-out={Number(day.slice(5, 7)) - 1 !== cursor.m || undefined} data-today={day === today || undefined}>
            <header><span>{Number(day.slice(8))}</span><button type="button" className="bd-x bd-hover" aria-label={`Add item on ${day}`} onClick={() => onCreate(day)}><Icon name="add-circle" size={14} /></button></header>
            {(byDate.get(day) ?? []).map((i) => <button key={i.id} type="button" className="bd-evt" onClick={() => onOpen(i.id)}>{i.title}</button>)}
          </div>
        ))}
      </div>
    </div>
  );
}

const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const when = (iso: string) => new Date(iso).toLocaleString();

/** Every file attached to the board's items, as a grid or a list (like Monday's Files Gallery). */
export function FilesView({ boardId, onOpen }: { boardId: string; onOpen: (id: string) => void }) {
  const [files, setFiles] = useState<BoardFile[] | null>(null);
  const [grid, setGrid] = useState(true);
  useEffect(() => { fetchBoardFiles(boardId).then(setFiles).catch(() => setFiles([])); }, [boardId]);
  if (!files) return null;
  if (files.length === 0) return <div className="bd-empty-state"><p>No files yet. Attach files from an item's side card and they appear here.</p></div>;
  return (
    <div>
      <div className="tt-tools"><button type="button" className="tt-dir" onClick={() => setGrid((g) => !g)}>{grid ? 'List' : 'Grid'}</button></div>
      <div className={grid ? 'bd-gallery' : 'bd-filelist'}>
        {files.map((f) => (
          <div key={f.id} className="bd-filecard">
            <b title={f.name}>{f.name}</b>
            <small>{size(f.size)} · {when(f.created_at)}</small>
            <button type="button" className="bd-link" onClick={() => onOpen(f.item_id)}>{f.item_title}</button>
            <button type="button" className="bd-link" onClick={() => downloadFile(f).catch((e) => toast.error(e.message))}>Download</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Feed: one card per item (avatar, title, stage, briefing excerpt, tags, deadline), like a social/profile feed. */
export function FeedView({ items, props, onOpen }: { items: Item[]; props: Property[]; onOpen: (id: string) => void }) {
  const owner = props.find((p) => p.type === 'select');
  const status = props.find((p) => p.type === 'status');
  const tags = props.find((p) => p.type === 'tags');
  const date = props.find((p) => p.type === 'date');
  const label = (p: Property | undefined, it: Item) => p?.options.find((o) => o.id === it.values[p.id])?.label;
  if (items.length === 0) return <div className="bd-empty-state"><p>No items to show. Create items in any view and they appear here as cards.</p></div>;
  return (
    <div className="bd-cards">
      {items.filter((i) => !i.parent_id).map((it) => {
        const own = label(owner, it);
        const st = status?.options.find((o) => o.id === it.values[status.id]);
        const tg = (tags && Array.isArray(it.values[tags.id]) ? (it.values[tags.id] as string[]) : []).map((id) => tags!.options.find((o) => o.id === id)?.label ?? id);
        const due = date ? String(it.values[date.id] ?? '') : '';
        return (
          <article key={it.id} className="bd-fcard">
            <div className="bd-card-head">
              <span className="bd-card-avatar" aria-hidden>{(own ?? it.title)[0]?.toUpperCase()}</span>
              <div>
                <button type="button" className="bd-card-title" onClick={() => onOpen(it.id)}>{it.title}</button>
                <div className="bd-card-sub">{own ?? 'No owner'}</div>
              </div>
            </div>
            {st && <div className="bd-chips"><span style={{ color: st.color, borderColor: st.color }}>{st.label}</span></div>}
            <p className="bd-card-body">{it.description || 'No briefing yet.'}</p>
            {tg.length > 0 && <div className="bd-chips">{tg.slice(0, 3).map((t) => <span key={t}>{t}</span>)}{tg.length > 3 && <span>+{tg.length - 3}</span>}</div>}
            <div className="bd-card-foot">
              <small>{due ? due.slice(0, 10) : 'No deadline'}</small>
              <button type="button" className="bd-btn bd-primary" onClick={() => onOpen(it.id)}>Open</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
