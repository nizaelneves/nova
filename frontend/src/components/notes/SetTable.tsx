import { useState } from 'react';
import { Icon } from '../Icon';
import { SourceInput } from '../memoir/SourceInput';
import type { Attachment, CollectionCount, NoteSummary } from '../../lib/notes-api';

/** The colours the user chose for tags (the rest get one from their name, so a tag looks the same everywhere). */
export const TAG_COLORS: Record<string, string> = {};
export const setTagColors = (map: Record<string, string>) => { Object.keys(TAG_COLORS).forEach((k) => delete TAG_COLORS[k]); Object.assign(TAG_COLORS, map); };
export const tagStyle = (name: string) => {
  const chosen = TAG_COLORS[name];
  if (chosen) return { background: `${chosen}29`, color: chosen };
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { background: `hsl(${h} 70% 60% / 0.16)`, color: `hsl(${h} 80% 72%)` };
};
const tagColor = tagStyle;

export function Tags({ names, onTag }: { names: string[]; onTag: (name: string) => void }) {
  return (
    <>
      {names.slice(0, 3).map((t) => (
        <button key={t} type="button" className="nt-tagpill" style={tagColor(t)} onClick={(e) => { e.stopPropagation(); onTag(t); }}>{t}</button>
      ))}
    </>
  );
}

/** Tags on a row: the tags, each with a small x on hover, and a + that opens a field which completes with the most likely tag. */
function TagCell({ names, known, onTag, onChange }: { names: string[]; known: string[]; onTag: (name: string) => void; onChange: (names: string[]) => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  const add = () => { const t = (adding ?? '').trim(); setAdding(null); if (t && !names.some((n) => n.toLowerCase() === t.toLowerCase())) onChange([...names, t]); };
  return (
    <span className="nt-tagcell" onClick={(e) => e.stopPropagation()}>
      {names.slice(0, 3).map((t) => (
        <span key={t} className="nt-tagpill" style={tagColor(t)}>
          <button type="button" className="nt-tagname" onClick={(e) => { e.stopPropagation(); onTag(t); }}>{t}</button>
          <button type="button" className="nt-tagx" aria-label={`Remove ${t}`} onClick={(e) => { e.stopPropagation(); onChange(names.filter((n) => n !== t)); }}>×</button>
        </span>
      ))}
      {names.length > 3 && <em className="nt-more">+{names.length - 3}</em>}
      {adding === null
        ? <button type="button" className="nt-tagplus" aria-label="Add Tag" onClick={(e) => { e.stopPropagation(); setAdding(''); }}>+</button>
        : (
          <span className="nt-taginput" onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(null); }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) add(); }}>
            <SourceInput value={adding} onChange={setAdding} options={known.filter((k) => !names.includes(k))} autoFocus />
          </span>
        )}
    </span>
  );
}

function Backlinks({ list, onOpen, onRemove }: { list: { id: string; title: string }[]; onOpen: (id: string) => void; onRemove?: (id: string) => void }) {
  return (
    <>
      {list.map((b) => (
        <span key={b.id} className="nt-back nt-back-x">
          <button type="button" className="nt-back-open" onClick={(e) => { e.stopPropagation(); onOpen(b.id); }}>
            <Icon name="document-text" size={13} /> <span className="truncate">{b.title || 'Untitled'}</span>
          </button>
          {onRemove && <button type="button" className="nt-tagx" aria-label={`Remove ${b.title}`} onClick={(e) => { e.stopPropagation(); onRemove(b.id); }}>×</button>}
        </span>
      ))}
    </>
  );
}

/** The notes a file is connected to: connect one with + (the field completes with the most likely title), remove with the x. */
function NoteLinks({ list, options, onOpen, onChange }: { list: { id: string; title: string }[]; options: { id: string; title: string }[]; onOpen: (id: string) => void; onChange: (ids: string[]) => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  const ids = list.map((n) => n.id);
  const add = () => {
    const t = (adding ?? '').trim().toLowerCase();
    setAdding(null);
    const hit = t && options.find((o) => o.title.toLowerCase() === t && !ids.includes(o.id));
    if (hit) onChange([...ids, hit.id]);
  };
  return (
    <span className="nt-tagcell" onClick={(e) => e.stopPropagation()}>
      <Backlinks list={list} onOpen={onOpen} onRemove={(id) => onChange(ids.filter((i) => i !== id))} />
      {adding === null
        ? <button type="button" className="nt-tagplus" aria-label="Connect A Note" onClick={(e) => { e.stopPropagation(); setAdding(''); }}>+</button>
        : (
          <span className="nt-taginput nt-linkinput" onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(null); }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) add(); }}>
            <SourceInput value={adding} onChange={setAdding} options={options.filter((o) => !ids.includes(o.id)).map((o) => o.title)} autoFocus />
          </span>
        )}
    </span>
  );
}

function Table({ head, count, footer, picking, template, children }: { head: string[]; count: number; footer?: React.ReactNode; picking?: boolean; template?: string; children: React.ReactNode }) {
  return (
    <div className="nt-table" role="table" data-picking={picking}>
      <div className="nt-tr nt-th" role="row" style={{ gridTemplateColumns: template ?? `minmax(0,1.6fr) ${head.slice(1).map(() => 'minmax(0,1fr)').join(' ')}` }}>
        {head.map((h) => <span key={h} role="columnheader">{h}</span>)}
      </div>
      {children}
      {footer}
      <div className="nt-foot">Unique {count}</div>
    </div>
  );
}

/** The small box at the start of a row: picks it, so several can be deleted at once (as in Anytype). */
function Check({ on, onPick }: { on: boolean; onPick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" className="nt-check" role="checkbox" aria-checked={on} aria-label="Select" data-on={on}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPick(e); }}>
      {on && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.500 4.500 4.500L19 7" /></svg>}
    </button>
  );
}

const ATT = 'minmax(0,1.9fr) minmax(0,1.5fr) minmax(0,1.4fr)'; // Name, Backlinks, Tag
const cols = (n: number) => ({ gridTemplateColumns: `minmax(0,1.6fr) ${Array(n).fill('minmax(0,1fr)').join(' ')}` });

const az = <T,>(rows: T[], key: (r: T) => string) => [...rows].sort((a, b) => key(a).localeCompare(key(b), undefined, { sensitivity: 'base' })); // every list reads A to Z

/** Pages, bookmarks and every other list of notes: Name, Backlinks, Tag. */
export function NotesTable({ rows, onOpen, onTag, onNew, newLabel = 'New Page', picked, onPick, known, onTags, onUnlink }: {
  rows: NoteSummary[]; onOpen: (id: string) => void; onTag: (name: string) => void; onNew?: () => void; newLabel?: string; picked: Set<string>; onPick: (key: string) => void; known: string[]; onTags: (id: string, tags: string[]) => void; onUnlink: (src: string, dst: string) => void;
}) {
  return (
    <Table
      head={['Name', 'Backlinks', 'Tag']}
      count={rows.length}
      picking={picked.size > 0}
      footer={onNew && <button type="button" className="nt-newrow" onClick={onNew}><Icon name="add-circle" size={15} /> {newLabel}</button>}
    >
      {az(rows, (n) => n.title || 'Untitled').map((n) => (
        <div key={n.id} role="row" tabIndex={0} data-key={n.id} data-picked={picked.has(n.id)} className="nt-tr nt-tr-link" style={cols(2)} onClick={() => onOpen(n.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n.id); }}>
          <span className="nt-name" role="cell"><Check on={picked.has(n.id)} onPick={() => onPick(n.id)} /><Icon name={n.kind === 'bookmark' ? 'link-round' : 'document-text'} size={16} /><b className="truncate">{n.title || 'Untitled'}</b></span>
          <span className="nt-cell" role="cell">
            {(n.kind === 'bookmark' ? [...(n.linked_from ?? []).map((b) => ({ ...b, out: false })), ...(n.linked_to ?? []).map((b) => ({ ...b, out: true }))] : (n.linked_from ?? []).map((b) => ({ ...b, out: false }))).slice(0, 3).map((b) => (
              <Backlinks key={`${b.id}${b.out}`} list={[b]} onOpen={onOpen} onRemove={() => onUnlink(b.out ? n.id : b.id, b.out ? b.id : n.id)} />
            ))}
          </span>
          <span className="nt-cell" role="cell"><TagCell names={n.tags} known={known} onTag={onTag} onChange={(t) => onTags(n.id, t)} /></span>
        </div>
      ))}
    </Table>
  );
}

/** Files or Images: the thing itself, and the notes that use it. */
export function AttachmentsTable({ rows, onOpen, onView, picked, onPick, known, onTags, onTag, noteOptions, onLinks, selectable = true }: { rows: Attachment[]; onOpen: (id: string) => void; onView: (a: Attachment) => void; picked: Set<string>; onPick: (key: string) => void; known: string[]; onTags: (name: string, tags: string[]) => void; onTag: (name: string) => void; noteOptions: { id: string; title: string }[]; onLinks: (name: string, ids: string[]) => void; selectable?: boolean }) {
  return (
    <Table head={['Name', 'Backlinks', 'Tag']} count={rows.length} picking={picked.size > 0} template={ATT}>
      {az(rows, (a) => a.label || a.name).map((a) => (
        <div key={a.name} role="row" data-key={a.name} data-picked={picked.has(a.name)} className="nt-tr" style={{ gridTemplateColumns: ATT }}>
          <span className="nt-name nt-viewable" role="cell" tabIndex={0} onClick={() => onView(a)} onKeyDown={(e) => { if (e.key === 'Enter') onView(a); }}>
            {selectable && <Check on={picked.has(a.name)} onPick={() => onPick(a.name)} />}
            {a.image ? <img src={a.url} alt="" loading="lazy" className="nt-thumb" /> : <Icon name="document-text" size={16} />}
            <b className="truncate">{a.label || a.name.slice(0, 12)}</b>
          </span>
          <span className="nt-cell" role="cell"><NoteLinks list={a.notes} options={noteOptions} onOpen={onOpen} onChange={(ids) => onLinks(a.name, ids)} /></span>
          <span className="nt-cell" role="cell"><TagCell names={a.tags ?? []} known={known} onTag={onTag} onChange={(t) => onTags(a.name, t)} /></span>
        </div>
      ))}
    </Table>
  );
}

/** Collections as a set, like the other types. */
export function CollectionsTable({ rows, onOpen, picked, onPick }: { rows: CollectionCount[]; onOpen: (c: CollectionCount) => void; picked: Set<string>; onPick: (key: string) => void }) {
  return (
    <Table head={['Name', 'Notes']} count={rows.length} picking={picked.size > 0}>
      {az(rows, (c) => c.name).map((c) => (
        <div key={c.id} role="row" tabIndex={0} data-key={c.id} data-picked={picked.has(c.id)} className="nt-tr nt-tr-link" style={cols(1)} onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c); }}>
          <span className="nt-name" role="cell"><Check on={picked.has(c.id)} onPick={() => onPick(c.id)} /><Icon name="folder" size={16} /><b className="truncate">{c.name}</b></span>
          <span className="nt-cell nt-dim" role="cell">{c.count}</span>
        </div>
      ))}
    </Table>
  );
}
