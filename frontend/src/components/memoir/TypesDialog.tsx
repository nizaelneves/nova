import { useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { deleteType, orderTypes, renameSource, renameType, typeLabel, type TextType } from '../../lib/swipe-api';

/** Edit the text types: rename, move up or down, or delete (their texts wait in the Trash). */
export function TypesDialog({ types, sources, counts, onChanged, onClose }: { types: TextType[]; sources: { name: string; count: number }[]; counts: Record<string, number>; onChanged: () => void; onClose: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sure, setSure] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something Went Wrong');
  const run = (job: Promise<unknown>, msg?: string) => { setBusy(true); void job.then(() => { if (msg) toast.success(msg); onChanged(); }).catch(fail).finally(() => setBusy(false)); };
  const move = (i: number, d: number) => {
    const ids = types.map((t) => t.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(orderTypes(ids));
  };
  return (
    <div className="mm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mm-box mm-box-sm mm-types" role="dialog" aria-label="Edit Types">
        <button type="button" className="mm-x" aria-label="Close" onClick={onClose}>×</button>
        <h4 className="mm-types-h">Types</h4>
        <ol className="mm-types-list">
          {types.map((t, i) => (
            <li key={t.id}>
              {editing === t.id ? (
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && name.trim() !== t.id) { run(renameType(t.id, name.trim()), 'Renamed'); setEditing(null); } if (e.key === 'Escape') setEditing(null); }}
                  onBlur={() => setEditing(null)} />
              ) : <span className="mm-types-name"><b>{typeLabel(t.id)}</b><small>{counts[t.id] ?? 0}</small></span>}
              <button type="button" aria-label="Move Up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label="Move Down" disabled={busy || i === types.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" aria-label="Rename" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditing(t.id); setName(typeLabel(t.id)); }}><Icon name="edit" size={15} /></button>
              <button type="button" className="mm-types-del" data-sure={sure === t.id} aria-label="Delete Type" disabled={busy}
                onClick={() => { if (sure === t.id) { setSure(null); run(deleteType(t.id), 'Type Moved To Trash'); } else setSure(t.id); }}>
                <Icon name="trash-bin-2" size={15} />{sure === t.id && <em>Sure?</em>}
              </button>
            </li>
          ))}
        </ol>
        {sources.length > 0 && <h4 className="mm-types-h mm-types-h2">Sources</h4>}
        <ol className="mm-types-list">
          {sources.map((src) => (
            <li key={src.name}>
              {editSource === src.name ? (
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && name.trim() !== src.name) { run(renameSource(src.name, name.trim()), 'Renamed'); setEditSource(null); } if (e.key === 'Escape') setEditSource(null); }}
                  onBlur={() => setEditSource(null)} />
              ) : <span className="mm-types-name"><b>{src.name}</b><small>{src.count}</small></span>}
              <button type="button" aria-label="Rename Source" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditSource(src.name); setName(src.name); }}><Icon name="edit" size={15} /></button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
