import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import {
  addComment, deleteComment, deleteFile, downloadFile, fetchActivity, fetchComments, fetchFiles, uploadFile,
  type Activity, type Attachment, type Comment, type Item, type Property, type Repeat, type Value,
} from '../../lib/boards-api';
import { nextStage } from '../../lib/board-view';
import { Cell } from './board-cells';

type Patch = { title?: string; description?: string; values?: Record<string, Value>; recurrence?: Repeat | null };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const UNIT = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' } as const;

/** Repeat rule of an item: how often, on which weekdays, until when and by which date. */
function RepeatEditor({ rule, dateProps, onChange }: { rule: Repeat | null; dateProps: Property[]; onChange: (r: Repeat | null) => void }) {
  if (dateProps.length === 0) return <p className="bd-hint">Add a Date property to make this item repeat.</p>;
  const set = (changes: Partial<Repeat>) => onChange({ ...(rule as Repeat), ...changes });
  return (
    <div className="bd-repeat">
      <select value={rule?.freq ?? ''} aria-label="Repeat"
        onChange={(e) => onChange(e.target.value ? { ...rule, freq: e.target.value as Repeat['freq'], weekdays: e.target.value === 'weekly' ? rule?.weekdays : undefined, prop: rule?.prop ?? dateProps[0].id } : null)}>
        <option value="">Does not repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
      {rule && (
        <>
          <label>every <input type="number" min={1} value={rule.interval ?? 1} aria-label="Repeat interval" onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} /> {UNIT[rule.freq]}</label>
          {rule.freq === 'weekly' && (
            <div className="bd-days">
              {DAYS.map((d, n) => {
                const on = !!rule.weekdays?.includes(n);
                return <button key={d} type="button" aria-pressed={on} onClick={() => set({ weekdays: on ? rule.weekdays!.filter((x) => x !== n) : [...(rule.weekdays ?? []), n].sort() })}>{d}</button>;
              })}
            </div>
          )}
          <label>until <input type="date" value={rule.until ?? ''} aria-label="Repeat until" onChange={(e) => set({ until: e.target.value || undefined })} /></label>
          {dateProps.length > 1 && (
            <label>by <select value={rule.prop ?? dateProps[0].id} aria-label="Repeat by" onChange={(e) => set({ prop: e.target.value })}>{dateProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          )}
          <p className="bd-hint">When this item reaches its first done stage, the next one is created.</p>
        </>
      )}
    </div>
  );
}

/** The item window, centred over the board: Briefing, Updates, Files and Activity. */
export function ItemPanel({ item, items, props, onPatch, onAddSub, onDelete, onEditProp, onOpen, onClose }: {
  item: Item;
  items: Item[];
  props: Property[];
  onPatch: (id: string, changes: Patch) => void;
  onAddSub: (parent: string, title: string) => void;
  onDelete: (id: string) => void;
  onEditProp: (p: Property) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [sub, setSub] = useState('');
  const [tab, setTab] = useState<'Briefing' | 'Updates' | 'Files' | 'Activity'>('Briefing');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const parent = item.parent_id ? items.find((i) => i.id === item.parent_id) : undefined;
  const subs = items.filter((i) => i.parent_id === item.id);
  const status = props.find((p) => p.type === 'status');
  const next = status ? nextStage(status, item.values[status.id]) : null;

  useEffect(() => { setTitle(item.title); setDescription(item.description); }, [item.id, item.title, item.description]);
  const loadComments = useCallback(() => { fetchComments(item.id).then(setComments).catch(() => setComments([])); }, [item.id]);
  useEffect(loadComments, [loadComments]);
  const loadExtras = useCallback(() => {
    fetchFiles(item.id).then(setFiles).catch(() => setFiles([]));
    fetchActivity(item.id).then(setActivity).catch(() => setActivity([]));
  }, [item.id]);
  // The history grows whenever the item changes (title, values, repeat...), so it reloads with it.
  useEffect(loadExtras, [loadExtras, item]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const send = () => {
    const body = comment.trim();
    if (!body) return;
    addComment(item.id, body).then(() => { setComment(''); loadComments(); }).catch((e) => toast.error(e instanceof Error ? e.message : 'Could not comment'));
  };

  return (
    <>
      <div className="bd-scrim" onClick={onClose} />
      <aside className="bd-panel" role="dialog" aria-modal="true" aria-label="Item details">
        <header>
          {parent && <button type="button" className="bd-link" onClick={() => onOpen(parent.id)}>← {parent.title}</button>}
          <button type="button" className="bd-x" aria-label="Close" onClick={onClose}><Icon name="close-circle" size={20} /></button>
        </header>
        <input className="bd-ptitle" value={title} aria-label="Title" onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { const t = title.trim(); if (t && t !== item.title) onPatch(item.id, { title: t }); else setTitle(item.title); }} />

        <div className="bd-ptabs" role="tablist" aria-label="Item sections">
          {(['Briefing', 'Updates', 'Files', 'Activity'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} data-on={tab === t} onClick={() => setTab(t)}>
              {t}{t === 'Updates' && comments.length > 0 ? ` · ${comments.length}` : ''}{t === 'Files' && files.length > 0 ? ` · ${files.length}` : ''}
            </button>
          ))}
        </div>

        {tab === 'Briefing' && status && (
          <div className="bd-stages" role="group" aria-label={status.name}>
            {status.options.map((o) => (
              <button key={o.id} type="button" aria-pressed={item.values[status.id] === o.id} style={{ ['--c' as string]: o.color }} onClick={() => onPatch(item.id, { values: { [status.id]: o.id } })}>{o.label}</button>
            ))}
            {next && <button type="button" className="bd-advance" onClick={() => onPatch(item.id, { values: { [status.id]: next.id } })}>Advance to {next.label} →</button>}
          </div>
        )}

        {tab === 'Briefing' && <>
        <dl className="bd-props">
          {props.map((p) => (
            <div key={p.id}>
              <dt>{p.name}</dt>
              <dd><Cell prop={p} item={item} onChange={(v) => onPatch(item.id, { values: { [p.id]: v } })} onEdit={() => onEditProp(p)} /></dd>
            </div>
          ))}
        </dl>

        <h4>Repeat</h4>
        <RepeatEditor rule={item.recurrence} dateProps={props.filter((p) => p.type === 'date')} onChange={(r) => onPatch(item.id, { recurrence: r })} />

        <h4>Briefing</h4>
        <textarea className="bd-desc bd-brief" rows={9} value={description} placeholder="Write the briefing…" onChange={(e) => setDescription(e.target.value)}
          onBlur={() => { if (description !== item.description) onPatch(item.id, { description }); }} />

        {!item.parent_id && (
          <>
            <h4>Sub-items {subs.length > 0 && <span>{subs.length}</span>}</h4>
            <ul className="bd-subs">
              {subs.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpen(s.id)}>{s.title}</button>
                  {status && <div className="bd-subcell"><Cell prop={status} item={s} onChange={(v) => onPatch(s.id, { values: { [status.id]: v } })} onEdit={() => onEditProp(status)} /></div>}
                  <button type="button" className="bd-x" aria-label={`Delete ${s.title}`} onClick={() => onDelete(s.id)}><Icon name="trash-bin-2" size={15} /></button>
                </li>
              ))}
            </ul>
            <input className="bd-field" value={sub} placeholder="+ Add sub-item" aria-label="Add sub-item" onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && sub.trim()) { onAddSub(item.id, sub.trim()); setSub(''); } }} />
          </>
        )}

        </>}

        {tab === 'Files' && <>
        <ul className="bd-subs">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => downloadFile(f).catch((e) => toast.error(e instanceof Error ? e.message : 'Download failed'))}>{f.name}</button>
              <small>{f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}</small>
              <button type="button" className="bd-x" aria-label={`Remove ${f.name}`} onClick={() => deleteFile(f.id).then(loadExtras).catch(() => undefined)}><Icon name="trash-bin-2" size={15} /></button>
            </li>
          ))}
        </ul>
        <label className="bd-link bd-upload">+ Attach files
          <input type="file" multiple hidden aria-label="Attach files" onChange={(e) => {
            const chosen = Array.from(e.target.files ?? []);
            e.target.value = '';
            Promise.all(chosen.map((f) => uploadFile(item.id, f))).catch((err) => toast.error(err instanceof Error ? err.message : 'Upload failed')).finally(loadExtras);
          }} />
        </label>

        {files.length === 0 && <p className="bd-hint">No files yet.</p>}
        </>}

        {tab === 'Updates' && <>
        <ul className="bd-comments">
          {comments.map((c) => (
            <li key={c.id}>
              <p>{c.body}</p>
              <small>{new Date(c.created_at).toLocaleString()}</small>
              <button type="button" className="bd-x" aria-label="Delete comment" onClick={() => deleteComment(c.id).then(loadComments).catch(() => undefined)}><Icon name="trash-bin-2" size={14} /></button>
            </li>
          ))}
        </ul>
        <div className="bd-send">
          <textarea className="bd-desc" rows={2} value={comment} placeholder="Write a comment…" aria-label="Comment" onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
          <button type="button" className="bd-btn bd-primary" disabled={!comment.trim()} onClick={send}>Comment</button>
        </div>
        </>}

        {tab === 'Activity' && (activity.length > 0
          ? <ul className="bd-activity">{activity.map((a) => <li key={a.id}><span>{a.text}</span><small>{new Date(a.created_at).toLocaleString()}</small></li>)}</ul>
          : <p className="bd-hint">No activity yet.</p>)}

        <footer><button type="button" className="bd-btn" style={{ color: 'var(--color-error)' }} onClick={() => onDelete(item.id)}>Delete {item.parent_id ? 'sub-item' : 'item'}</button></footer>
      </aside>
    </>
  );
}
