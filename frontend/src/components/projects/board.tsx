import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import {
  OPS, groupItems, needsValue, subProgress, visibleItems,
} from '../../lib/board-view';
import {
  createBoard, createItem, createProperty, createView, deleteItem, deleteProperty, deleteView, fetchBoard, fetchBoards,
  updateItem, updateProperty, updateView,
  type Board, type Filter, type Item, type Property, type PropertyType, type Value, type ViewConfig, type ViewType,
} from '../../lib/boards-api';
import { Cell, PropertyEditor, TYPE_LABEL } from './board-cells';
import { CalendarView, FeedView, FilesView, KanbanView } from './board-views';
import { ItemPanel } from './item-panel';

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
const VIEW_NAME: Record<ViewType, string> = { table: 'Table', kanban: 'Kanban', calendar: 'Calendar', files: 'Files', feed: 'Feed' };
const TYPES = Object.keys(TYPE_LABEL) as PropertyType[];
const hasOptions = (p: Property) => p.type === 'status' || p.type === 'select' || p.type === 'tags';

/** Filters of the current view: one row per condition, all of them must match. */
function FilterBar({ props, filters, onChange }: { props: Property[]; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const set = (i: number, changes: Partial<Filter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...changes } : f)));
  const add = () => { const p = props[0]; if (p) onChange([...filters, { prop: p.id, op: OPS[p.type][0].id }]); };
  return (
    <div className="bd-filters">
      {filters.map((f, i) => {
        const p = props.find((x) => x.id === f.prop) ?? props[0];
        return (
          <div key={i} className="bd-filter">
            <select value={f.prop} aria-label="Filter property" onChange={(e) => { const np = props.find((x) => x.id === e.target.value)!; onChange(filters.map((x, j) => (j === i ? { prop: np.id, op: OPS[np.type][0].id } : x))); }}>
              {props.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select value={f.op} aria-label="Filter condition" onChange={(e) => set(i, { op: e.target.value as Filter['op'] })}>
              {OPS[p.type].map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {needsValue(f.op) && (hasOptions(p)
              ? (
                <select value={f.value ?? ''} aria-label="Filter value" onChange={(e) => set(i, { value: e.target.value })}>
                  <option value="">Choose…</option>
                  {p.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              )
              : <input type={p.type === 'date' ? 'date' : p.type === 'number' ? 'number' : 'text'} value={f.value ?? ''} aria-label="Filter value" onChange={(e) => set(i, { value: e.target.value })} />)}
            <button type="button" className="bd-x" aria-label="Remove filter" onClick={() => onChange(filters.filter((_, j) => j !== i))}><Icon name="close-circle" size={16} /></button>
          </div>
        );
      })}
      <button type="button" className="bd-link" onClick={add}>+ Add filter</button>
    </div>
  );
}

/** A workspace's board: only its views are shown, with the user's own properties and the item window. */
export function BoardPanel({ workspaceId }: { workspaceId: string }) {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editProp, setEditProp] = useState<Property | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [pickingView, setPickingView] = useState(false);
  const [renamingView, setRenamingView] = useState<string | null>(null);
  const [newProp, setNewProp] = useState<{ name: string; type: PropertyType } | null>(null);
  const [adds, setAdds] = useState<Record<string, string>>({});

  // The workspace's board is created the first time and never shown on its own: only its views are.
  useEffect(() => {
    let live = true;
    fetchBoards(workspaceId)
      .then((list) => list[0] ?? createBoard(workspaceId, 'Board'))
      .then((b) => { if (live) setBoardId(b.id); })
      .catch((e) => { if (live) fail(e); });
    return () => { live = false; };
  }, [workspaceId]);
  const loadBoard = useCallback(() => { if (boardId) fetchBoard(boardId).then(setBoard).catch(() => setBoard(null)); else setBoard(null); }, [boardId]);
  useEffect(loadBoard, [loadBoard]);

  const view = board?.views.find((v) => v.id === viewId) ?? board?.views[0];
  const props = board?.properties ?? [];
  const config: ViewConfig = view?.config ?? {};
  const statusProp = props.find((p) => p.type === 'status');
  const groupable = props.filter((p) => p.type === 'status' || p.type === 'select');
  const kanbanProp = groupable.find((p) => p.id === config.groupBy) ?? statusProp ?? groupable[0];
  const dates = props.filter((p) => p.type === 'date');
  const dateProp = dates.find((p) => p.id === config.dateBy) ?? dates[0];

  const shown = useMemo(() => (board ? visibleItems(board.items, props, config, query) : []), [board, props, config, query]);
  const groups = useMemo(() => groupItems(shown, props, config.groupBy), [shown, props, config.groupBy]);

  const setConfig = (changes: Partial<ViewConfig>) => {
    if (!view || !board) return;
    const next = { ...view.config, ...changes };
    setBoard({ ...board, views: board.views.map((v) => (v.id === view.id ? { ...v, config: next } : v)) });
    updateView(view.id, { config: next }).catch(fail);
  };

  const patchItem = async (id: string, changes: { title?: string; description?: string; values?: Record<string, Value> }) => {
    setBoard((b) => b && {
      ...b,
      items: b.items.map((i) => {
        if (i.id !== id) return i;
        const values = { ...i.values };
        for (const [k, v] of Object.entries(changes.values ?? {})) { if (v === null) delete values[k]; else values[k] = v; }
        return { ...i, title: changes.title ?? i.title, description: changes.description ?? i.description, values };
      }),
    });
    try { await updateItem(id, changes); } catch (e) { fail(e); } finally { loadBoard(); }
  };

  // New items start in the first stage of the status property, so they show up under it.
  const startValues = (extra: Record<string, Value> = {}) => (statusProp?.options[0] ? { [statusProp.id]: statusProp.options[0].id, ...extra } : extra);
  const addItem = (title: string, extra: Record<string, Value> = {}) => { if (board) createItem(board.id, title, { values: startValues(extra) }).catch(fail).finally(loadBoard); };
  const addSub = (parent: string, title: string) => { if (board) createItem(board.id, title, { parent_id: parent, values: startValues() }).catch(fail).finally(loadBoard); };
  const removeItem = (id: string) => {
    if (!window.confirm('Delete this item and its sub-items?')) return;
    if (openId === id) setOpenId(null);
    deleteItem(id).catch(fail).finally(loadBoard);
  };

  if (!board || !view) return <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>;

  const open = board?.items.find((i) => i.id === openId) ?? null;
  const cols = `1.8rem minmax(15rem, 1fr) ${props.map(() => '9.5rem').join(' ')} 2.4rem`;

  const row = (item: Item, depth: number) => {
    const subs = board!.items.filter((i) => i.parent_id === item.id);
    const prog = subProgress(board!.items, props, item.id);
    const isOpen = expanded.has(item.id);
    return (
      <div key={item.id}>
        <div className="bd-row" style={{ gridTemplateColumns: cols }} role="row">
          <div>
            {subs.length > 0 && (
              <button type="button" className="bd-x" aria-expanded={isOpen} aria-label={isOpen ? 'Hide sub-items' : 'Show sub-items'}
                onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}>
                <Icon name="alt-arrow-down" size={15} className={isOpen ? '' : 'bd-rot'} />
              </button>
            )}
          </div>
          <div className="bd-titlecell" style={{ paddingLeft: depth * 18 }}>
            <button type="button" className="bd-title" onClick={() => setOpenId(item.id)}>{item.title}</button>
            {item.recurrence && <small className="bd-count" title="Repeats">↻</small>}
            {subs.length > 0 && <small className="bd-count" title="Sub-items done">{prog.done}/{prog.total}</small>}
          </div>
          {props.map((p) => (
            <div key={p.id}><Cell prop={p} item={item} onChange={(v) => void patchItem(item.id, { values: { [p.id]: v } })} onEdit={() => setEditProp(p)} /></div>
          ))}
          <div><button type="button" className="bd-x bd-hover" aria-label={`Open ${item.title}`} onClick={() => setOpenId(item.id)}><Icon name="chat-round-dots" size={16} /></button></div>
        </div>
        {isOpen && subs.map((s) => row(s, depth + 1))}
      </div>
    );
  };

  return (
    <div className="bd">
      {board && view && (
        <>
          <div className="bd-tabs bd-views" role="tablist" aria-label="Views">
            {board.views.map((v) => (
              <span key={v.id} className="bd-tabwrap">
                {renamingView === v.id ? (
                  <input autoFocus className="bd-field" defaultValue={v.name} aria-label="View name"
                    onBlur={(e) => { const n = e.target.value.trim(); setRenamingView(null); if (n && n !== v.name) updateView(v.id, { name: n }).catch(fail).finally(loadBoard); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingView(null); }} />
                ) : (
                  <button type="button" role="tab" aria-selected={v.id === view.id} data-on={v.id === view.id} onClick={() => setViewId(v.id)} onDoubleClick={() => setRenamingView(v.id)}>{v.name}</button>
                )}
                {v.id === view.id && renamingView !== v.id && (
                  <button type="button" className="bd-x" aria-label={`Rename view ${v.name}`} title="Rename" onClick={() => setRenamingView(v.id)}><Icon name="lucide-file-pen" size={14} /></button>
                )}
                {v.id === view.id && board.views.length > 1 && (
                  <button type="button" className="bd-x" aria-label={`Delete view ${v.name}`} onClick={() => { setViewId(null); deleteView(v.id).catch(fail).finally(loadBoard); }}><Icon name="close-circle" size={14} /></button>
                )}
              </span>
            ))}
            {pickingView
              ? (['table', 'kanban', 'calendar', 'files', 'feed'] as const).map((t) => (
                <button key={t} type="button" className="bd-link" onClick={() => {
                  setPickingView(false);
                  const config: ViewConfig = t === 'calendar' ? { dateBy: dates[0]?.id ?? null } : t === 'kanban' ? { groupBy: (statusProp ?? groupable[0])?.id ?? null } : {};
                  createView(board.id, VIEW_NAME[t], t, config).then((v) => { setViewId(v.id); loadBoard(); }).catch(fail);
                }}>{VIEW_NAME[t]}</button>
              ))
              : <button type="button" className="bd-link" onClick={() => setPickingView(true)}>+ View</button>}
          </div>

          {view.type !== 'files' && <div className="tt-tools">
            <label className="tt-search"><Icon name="magnifer" size={15} /><input value={query} placeholder="Search" aria-label="Search items" onChange={(e) => setQuery(e.target.value)} /></label>
            <button type="button" className="tt-dir" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>Filter{(config.filters?.length ?? 0) > 0 ? ` · ${config.filters!.length}` : ''}</button>
            <label className="tt-select"><span>Sort</span>
              <select value={config.sort?.prop ?? ''} onChange={(e) => setConfig({ sort: e.target.value ? { prop: e.target.value, desc: config.sort?.desc ?? false } : null })}>
                <option value="">None</option>
                {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {config.sort && <button type="button" className="tt-dir" onClick={() => setConfig({ sort: { ...config.sort!, desc: !config.sort!.desc } })}><Icon name="sort" size={15} />{config.sort.desc ? 'Desc' : 'Asc'}</button>}
            {(view.type === 'table' || view.type === 'kanban') && <label className="tt-select"><span>Group</span>
              <select value={config.groupBy ?? ''} onChange={(e) => setConfig({ groupBy: e.target.value || null })}>
                <option value="">None</option>
                {groupable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>}
          </div>}
          {showFilters && <FilterBar props={props} filters={config.filters ?? []} onChange={(filters) => setConfig({ filters })} />}

          {view.type === 'kanban' && (kanbanProp
            ? <KanbanView items={shown} all={board.items} props={props} groupProp={kanbanProp} onOpen={setOpenId}
                onSet={(item, option) => void patchItem(item.id, { values: { [kanbanProp.id]: option } })}
                onAdd={(title, option) => addItem(title, option ? { [kanbanProp.id]: option } : {})} />
            : <div className="bd-empty-state"><p>Add a Status or Select property to use the Kanban view.</p></div>)}
          {view.type === 'calendar' && (
            <CalendarView items={shown} dateProp={dateProp} dateOptions={dates} onOpen={setOpenId} onDateProp={(id) => setConfig({ dateBy: id })}
              onCreate={(day) => { if (dateProp) createItem(board.id, 'New item', { values: startValues({ [dateProp.id]: day }) }).then((i) => { setOpenId(i.id); loadBoard(); }).catch(fail); }} />
          )}
          {view.type === 'files' && <FilesView boardId={board.id} onOpen={setOpenId} />}
          {view.type === 'feed' && <FeedView items={shown} props={props} onOpen={setOpenId} />}
          {view.type === 'table' && <div className="tt-scroll" role="table" aria-label={board.name}>
            <div className="bd-row bd-head" style={{ gridTemplateColumns: cols }} role="row">
              <span /><span role="columnheader">Item</span>
              {props.map((p) => <button key={p.id} type="button" role="columnheader" className="bd-colname" title="Edit property" onClick={() => setEditProp(p)}>{p.name}</button>)}
              <span>
                <button type="button" className="bd-x" aria-label="Add property" onClick={() => setNewProp(newProp ? null : { name: '', type: 'text' })}><Icon name="add-circle" size={18} /></button>
              </span>
            </div>
            {newProp && (
              <form className="bd-newprop" onSubmit={(e) => {
                e.preventDefault();
                if (!newProp.name.trim()) return;
                createProperty(board.id, newProp.name.trim(), newProp.type).then((p) => { setNewProp(null); loadBoard(); if (hasOptions(p)) setEditProp(p); }).catch(fail);
              }}>
                <input autoFocus className="bd-field" placeholder="Property name" aria-label="Property name" value={newProp.name} onChange={(e) => setNewProp({ ...newProp, name: e.target.value })} />
                <select value={newProp.type} aria-label="Property type" onChange={(e) => setNewProp({ ...newProp, type: e.target.value as PropertyType })}>
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <button type="submit" className="bd-btn bd-primary">Add</button>
              </form>
            )}
            {groups.map((g) => (
              <section key={g.key} className="bd-group" style={{ ['--g' as string]: g.color ?? 'var(--color-accent)' }}>
                {g.label && (
                  <button type="button" className="tt-ghead" aria-expanded={!collapsed.has(g.key)} onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
                    <Icon name="alt-arrow-down" size={16} className="tt-chev" /><b>{g.label}</b><span>{g.items.length}</span>
                  </button>
                )}
                {!collapsed.has(g.key) && (
                  <>
                    {g.items.map((i) => row(i, 0))}
                    <div className="bd-row bd-add" style={{ gridTemplateColumns: cols }}>
                      <span />
                      <input value={adds[g.key] ?? ''} placeholder="+ Add item" aria-label={`Add item${g.label ? ` to ${g.label}` : ''}`}
                        onChange={(e) => setAdds({ ...adds, [g.key]: e.target.value })}
                        onKeyDown={(e) => {
                          const title = (adds[g.key] ?? '').trim();
                          if (e.key !== 'Enter' || !title) return;
                          addItem(title, config.groupBy && g.key ? { [config.groupBy]: g.key } : {});
                          setAdds({ ...adds, [g.key]: '' });
                        }} />
                    </div>
                  </>
                )}
              </section>
            ))}
          </div>}
        </>
      )}

      {open && board && (
        <ItemPanel item={open} items={board.items} props={props} onPatch={(id, c) => void patchItem(id, c)} onAddSub={addSub} onDelete={removeItem}
          onEditProp={setEditProp} onOpen={setOpenId} onClose={() => setOpenId(null)} />
      )}
      {editProp && board && (
        <PropertyEditor key={editProp.id} prop={editProp} onClose={() => setEditProp(null)}
          onSave={(name, options) => { updateProperty(editProp.id, { name, ...(hasOptions(editProp) ? { options } : {}) }).catch(fail).finally(loadBoard); setEditProp(null); }}
          onDelete={() => { if (window.confirm(`Delete the property "${editProp.name}" and its values?`)) { deleteProperty(editProp.id).catch(fail).finally(loadBoard); setEditProp(null); } }} />
      )}
    </div>
  );
}
