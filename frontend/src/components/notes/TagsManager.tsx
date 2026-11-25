import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { disintegrate } from '../../lib/disintegrate';
import { createTag, deleteTag, editTag, type TagCount } from '../../lib/notes-api';
import { TAG_COLORS, tagStyle } from './SetTable';
import { SortControl, sortRows, useSort } from '../memoir/SortControl';

/** Tags in one place: search them, see how much each is used, and rename, colour, merge or delete with one click. */
export function TagsManager({ tags, onOpen, onChanged }: { tags: TagCount[]; onOpen: (name: string) => void; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const sort = useSort('tags', ['az', 'used']);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [palette, setPalette] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tags.filter((t) => !q || t.name.toLowerCase().includes(q));
    return sortRows(rows, sort.mode, (t) => t.name, (t) => t.modified ?? 0, (t) => t.count);
  }, [tags, query, sort.mode]);
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something Went Wrong');
  const done = (msg?: string) => { if (msg) toast.success(msg); onChanged(); };

  return (
    <div className="nt-tagsman">
      <header className="nt-set-head">
        <h1><Icon name="lucide-tags" size={26} /> Tags</h1>
        <p>{tags.length} {tags.length === 1 ? 'Tag' : 'Tags'}</p>
        <div className="nt-set-actions">
          <SortControl sort={sort} />
          {adding === null
            ? <button type="button" className="nt-btn nt-primary" onClick={() => setAdding('')}><Icon name="add-circle" size={17} /> New Tag</button>
            : <input autoFocus className="nt-add nt-url" value={adding} placeholder="Insert a name for a tag" aria-label="Tag Name"
                onChange={(e) => setAdding(e.target.value)} onBlur={() => { if (!adding.trim()) setAdding(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { createTag(adding.trim()).then(() => { setAdding(null); done('Tag Added'); }).catch(fail); } if (e.key === 'Escape') setAdding(null); }} />}
        </div>
      </header>
      <div className="nt-tagbar">
        <div className="nt-search"><Icon name="magnifer" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to filter tags" aria-label="Find A Tag" /></div>
      </div>
      {shown.length === 0 ? <p className="nt-empty">{tags.length === 0 ? 'No Tags Yet' : 'No Tag Matches'}</p> : (
        <div className="nt-taggrid">
          {shown.map((t) => (
            <div key={t.name} className="nt-tagcard" data-key={`tag:${t.name}`}>
              {editing === t.name ? (
                <input autoFocus className="nt-tagedit" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null);
                    if (e.key === 'Enter' && name.trim() && name.trim() !== t.name) { editTag(t.name, { new_name: name.trim() }).then(() => { setEditing(null); done('Renamed'); }).catch(fail); }
                  }} />
              ) : (
                <button type="button" className="nt-tagmain" onClick={() => onOpen(t.name)}>
                  <span className="nt-tagpill" style={tagStyle(t.name)}>{t.name}</span>
                  <small>{t.count} {t.count === 1 ? 'Note' : 'Notes'}</small>
                </button>
              )}
              <span className="nt-tagacts">
                <button type="button" aria-label="Rename" onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditing(t.name); setName(t.name); }}><Icon name="lucide-file-pen" size={14} /></button>
                <button type="button" aria-label="Color" data-on={palette === t.name} onClick={() => setPalette(palette === t.name ? null : t.name)}><i style={{ background: TAG_COLORS[t.name] ?? tagStyle(t.name).color }} /></button>
                <button type="button" className="nt-tagdel" data-sure={sure === t.name} aria-label="Delete" onClick={() => {
                  if (sure !== t.name) { setSure(t.name); return; }
                  setSure(null);
                  void disintegrate(document.querySelector<HTMLElement>(`[data-key="${CSS.escape(`tag:${t.name}`)}"]`)).then(() => deleteTag(t.name)).then(() => done('Tag Deleted')).catch(fail);
                }}><Icon name="lucide-trash" size={14} />{sure === t.name && <em>Sure?</em>}</button>
              </span>
              {palette === t.name && (
                <div className="nt-swatches" role="group" aria-label="Pick A Color">
                  {PALETTE.map((c) => <button key={c} type="button" style={{ background: c }} aria-label={c} data-on={TAG_COLORS[t.name] === c}
                    onClick={() => { editTag(t.name, { color: c }).then(() => { setPalette(null); done(); }).catch(fail); }} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PALETTE = ['#8fe3ff', '#7aa2ff', '#a78bfa', '#e879f9', '#ff8aa0', '#f6a35f', '#ffd166', '#c4f27a', '#5ef2b0', '#9aa5b1'];
