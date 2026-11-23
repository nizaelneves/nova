import { useState } from 'react';
import { Icon } from '../Icon';
import { Pick } from '../memoir/Pick';
import type { CollectionCount, TagCount } from '../../lib/notes-api';

/** The tags of one note: chips to remove, and a box to add (the tags that exist are suggested in a menu of Memoir's own). */
export function TagEditor({ tags, known, onChange }: { tags: string[]; known: TagCount[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const has = (name: string) => tags.some((t) => t.toLowerCase() === name.toLowerCase());
  const add = (value = text) => {
    const name = value.trim().replace(/,$/, '').trim();
    setText('');
    if (name && !has(name)) onChange([...tags, name]);
  };
  const near = known.filter((k) => !has(k.name) && k.name.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 8);
  return (
    <div className="nt-organize">
      {tags.map((t) => (
        <span key={t} className="nt-chip">
          <Icon name="tag" size={12} /> {t}
          <button type="button" aria-label={`Remove Tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><Icon name="close-circle" size={12} /></button>
        </span>
      ))}
      <span className="mm-dd">
        <input
          className="nt-add" value={text} placeholder="Add Tag" aria-label="Add Tag"
          onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          onBlur={() => { setFocus(false); add(); }}
        />
        {focus && near.length > 0 && (
          <div className="mm-dd-menu" role="listbox">
            {near.map((k) => (
              <button key={k.name} type="button" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); add(k.name); }}>
                <span className="truncate">{k.name}</span><small>{k.count}</small>
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}

/** The collections of one note: chips to remove, a list to add one, and a way to start a new collection. */
export function CollectionEditor({ current, all, onChange, onCreate }: {
  current: { id: string; name: string }[];
  all: CollectionCount[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<{ id: string }>;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const ids = current.map((c) => c.id);
  const create = async () => {
    const clean = name.trim();
    setNaming(false); setName('');
    if (clean) onChange([...ids, (await onCreate(clean)).id]);
  };
  return (
    <div className="nt-organize">
      {current.map((c) => (
        <span key={c.id} className="nt-chip">
          <Icon name="folder" size={12} /> {c.name}
          <button type="button" aria-label={`Remove From ${c.name}`} onClick={() => onChange(ids.filter((x) => x !== c.id))}><Icon name="close-circle" size={12} /></button>
        </span>
      ))}
      {naming ? (
        <input autoFocus className="nt-add" value={name} placeholder="Collection Name" aria-label="Collection Name"
          onChange={(e) => setName(e.target.value)} onBlur={() => void create()}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create(); } if (e.key === 'Escape') { setNaming(false); setName(''); } }} />
      ) : (
        <Pick label="Add To Collection" value="" placeholder="Add To Collection…"
          options={[...all.filter((c) => !ids.includes(c.id)).map((c) => ({ value: c.id, label: c.name })), { value: '__new__', label: 'New Collection…' }]}
          onChange={(v) => { if (v === '__new__') setNaming(true); else onChange([...ids, v]); }} />
      )}
    </div>
  );
}
