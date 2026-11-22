import { useState } from 'react';
import { Icon } from '../Icon';
import type { CollectionCount, TagCount } from '../../lib/notes-api';

/** The tags of one note: chips to remove, and a box to add (existing tags are suggested). */
export function TagEditor({ tags, known, onChange }: { tags: string[]; known: TagCount[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const name = text.trim().replace(/,$/, '').trim();
    setText('');
    if (name && !tags.some((t) => t.toLowerCase() === name.toLowerCase())) onChange([...tags, name]);
  };
  return (
    <div className="nt-organize">
      {tags.map((t) => (
        <span key={t} className="nt-chip">
          <Icon name="tag" size={12} /> {t}
          <button type="button" aria-label={`Remove Tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><Icon name="close-circle" size={12} /></button>
        </span>
      ))}
      <input
        className="nt-add" value={text} list="nt-known-tags" placeholder="Add Tag" aria-label="Add Tag"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
      <datalist id="nt-known-tags">{known.filter((k) => !tags.includes(k.name)).map((k) => <option key={k.name} value={k.name} />)}</datalist>
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
        <select className="nt-add" aria-label="Add To Collection" value=""
          onChange={(e) => { if (e.target.value === '__new__') setNaming(true); else if (e.target.value) onChange([...ids, e.target.value]); }}>
          <option value="">Add To Collection…</option>
          {all.filter((c) => !ids.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__">New Collection…</option>
        </select>
      )}
    </div>
  );
}
