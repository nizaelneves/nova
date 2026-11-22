import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../components/Icon';
import { Popup } from '../components/Popup';
import { ConfirmDelete, EditProject, Mark, ProjectMenu, type MenuItem } from '../components/projects/project-edit';
import { BoardPanel } from '../components/projects/board';
import { ProjectColorContext, TaskForm, apiErrorMessage } from '../components/projects/tasks';
import { TerminalLine } from '../components/TerminalLine';
import { fetchHomeSettings } from '../lib/api';
import { forget, loadMeta, saveMeta, setLook, type Look, type MetaStore } from '../lib/projectMeta';
import { type SortMode, PERSONAL_COLOR, colorOf, counters, firstName, sortAreas, summarize } from '../lib/projects';
import { type Area, type Task, createArea, deleteArea, deleteTask, fetchAreas, fetchKanban, renameArea } from '../lib/tasks-api';

const ME = 'me';

const SORT_KEY = 'phibe-projects-sort';
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'ascending', label: 'Ascending' },
  { id: 'descending', label: 'Descending' },
  { id: 'a-z', label: 'A-Z' },
  { id: 'z-a', label: 'Z-A' },
];

function loadSort(): SortMode {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return SORTS.some((o) => o.id === saved) ? (saved as SortMode) : 'a-z';
  } catch {
    return 'a-z';
  }
}

/** A small menu to pick one option, in the style of the period picker of Finances. */
function Picker<T extends string>({ icon, label, options, value, onChange }: { icon: IconName; label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="fin-range">
      <button type="button" className="fin-range-btn" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <Icon name={icon} size={16} />
        <span>{options.find((o) => o.id === value)?.label}</span>
        <Icon name="alt-arrow-down" size={14} />
      </button>
      {open && (
        <div className="fin-range-pop" style={{ width: 190 }} role="listbox" aria-label={label}>
          {options.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={value === o.id} data-active={value === o.id} className="fin-range-item" onClick={() => { onChange(o.id); setOpen(false); }}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One project on the home grid: its round mark, how much is open, what is next and how far along it is. */
function ProjectCard({ name, color, look, personal, tasks, menu, onOpen }: { name: string; color: string; look?: Look; personal?: boolean; tasks: Task[]; menu: MenuItem[]; onOpen: () => void }) {
  const open = tasks.filter((t) => t.status !== 'done');
  const pct = tasks.length ? Math.round((100 * (tasks.length - open.length)) / tasks.length) : 0;
  const next = [...open].sort((a, b) => a.due.localeCompare(b.due))[0];
  return (
    <div className="pj-pwrap" data-archived={look?.archived || undefined}>
      <button type="button" className="pj-pcard" style={{ ['--c' as string]: color }} onClick={onOpen}>
        <span className="pj-pcard-mark"><Mark name={name} look={look} color={color} personal={personal} /></span>
        <h3>{name}</h3>
        <p><Icon name="checklist-minimalistic" size={15} />{open.length} Open {open.length === 1 ? 'Task' : 'Tasks'}</p>
        <p><Icon name="clock-circle" size={15} />{next ? `Next: ${new Date(next.due.slice(0, 10) + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Nothing Due'}</p>
        <div className="pj-pcard-foot">
          <span>Tasks<b>{tasks.length}</b></span>
          <span>Progress<b>{pct}%</b></span>
        </div>
        <i className="pj-pcard-bar"><u style={{ width: `${pct}%` }} /></i>
      </button>
      <ProjectMenu name={name} items={menu} />
    </div>
  );
}

export function ProjectsPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [meta, setMeta] = useState<MetaStore>(loadMeta);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>(loadSort);
  const chooseSort = (m: SortMode) => { setSort(m); try { localStorage.setItem(SORT_KEY, m); } catch { /* not remembered */ } };
  const [editing, setEditing] = useState<Task | null | 'new'>(null);
  const [myName, setMyName] = useState('Personal');
  const [newName, setNewName] = useState('');

  const load = useCallback(() => {
    fetchAreas().then(setAreas).catch(() => setAreas([]));
    fetchKanban().then((columns) => setTasks(Object.values(columns).flat())).catch(() => setTasks([]));
  }, []);

  useEffect(load, [load]);
  useEffect(() => { saveMeta(meta); }, [meta]);
  useEffect(() => { fetchHomeSettings().then((h) => setMyName(firstName(h.display_name))).catch(() => undefined); }, []);

  const color = useMemo(() => colorOf(areas), [areas]);
  const area = areas.find((a) => a.id === selected) ?? null;
  const scope = (tasks ?? []).filter((t) => (selected === null ? true : selected === ME ? !t.area_id : t.area_id === selected));
  const tint = area ? color(area.id) : selected === ME ? PERSONAL_COLOR : '#e9ecf5';

  const addClient = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createArea(name);
      setSelected(created.id);
      setNewName('');
      setCreating(false);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const restyle = (id: string, changes: Partial<Look>) => setMeta((m) => setLook(m, id, changes));

  const saveProject = (id: string, name: string, look: Pick<Look, 'icon' | 'image'>) => {
    restyle(id, look);
    const target = areas.find((a) => a.id === id);
    if (target && name && name !== target.name) {
      renameArea(id, name).then(load).catch((err) => toast.error(apiErrorMessage(err)));
    }
    setRenaming(null);
  };

  const deleteProject = async (id: string) => {
    const target = areas.find((a) => a.id === id);
    if (!target) return;
    try {
      await Promise.all((tasks ?? []).filter((t) => t.area_id === id).map((t) => deleteTask(t.id)));
      await deleteArea(id);
      setMeta((m) => forget(m, id));
      setDeleting(null);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  return (
    <ProjectColorContext.Provider value={color}>
      <div className="pj-root h-full overflow-y-auto">
        <div className="pj-wrap">
          {selected === null ? (
            <>
              <header className="fin-header pj-head">
                {tasks !== null && <TerminalLine text={summarize(scope, new Date())} />}
                <div className="fin-controls">
                  <div className="fin-actions" role="tablist" aria-label="Projects sections">
                    <button type="button" className="fin-btn fin-add" onClick={() => setCreating(true)}><Icon name="add-circle" size={16} /> New Workspace</button>
                    <button type="button" className="fin-btn fin-add" onClick={() => setEditing('new')}><Icon name="add-circle" size={16} /> New Task</button>
                  </div>
                  <div className="flex gap-2">
                    {(showArchived || areas.some((a) => meta[a.id]?.archived)) && (
                      <button type="button" className="fin-range-btn" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                        <Icon name="inbox" size={16} />
                        <span>{showArchived ? 'Back To Workspaces' : `Archived ${areas.filter((a) => meta[a.id]?.archived).length}`}</span>
                      </button>
                    )}
                    <Picker icon="sort" label="Order the workspaces" options={SORTS} value={sort} onChange={chooseSort} />
                  </div>
                </div>
              </header>
              <>
              <div className="pj-pgrid">
                {[{ id: ME, name: myName, c: PERSONAL_COLOR, personal: true, mine: (t: Task) => !t.area_id }, ...sortAreas(areas.filter((a) => !!meta[a.id]?.archived === showArchived), sort).map((a) => ({ id: a.id, name: a.name, c: color(a.id), personal: false, mine: (t: Task) => t.area_id === a.id }))]
                  .filter((p) => !(p.personal && showArchived))
                  .map((p) => (
                    <ProjectCard
                      key={p.id}
                      name={p.name}
                      color={p.c}
                      look={meta[p.id]}
                      personal={p.personal}
                      tasks={(tasks ?? []).filter(p.mine)}
                      onOpen={() => setSelected(p.id)}
                      menu={p.personal
                        ? [{ label: 'Edit', onSelect: () => setRenaming(p.id) }]
                        : [
                            { label: 'Edit', onSelect: () => setRenaming(p.id) },
                            meta[p.id]?.archived ? { label: 'Restore', onSelect: () => restyle(p.id, { archived: false }) } : { label: 'Archive', onSelect: () => restyle(p.id, { archived: true }) },
                            { label: 'Delete', danger: true, onSelect: () => setDeleting(p.id) },
                          ]}
                    />
                  ))}
              </div>
              </>
            </>
          ) : (
          <>
          <div className="pj-top">
            <button type="button" className="pj-back" onClick={() => setSelected(null)}><Icon name="alt-arrow-down" size={16} />Workspaces</button>
          </div>

          <div className="pj-detail">
            <div className="pj-main">
              <header className="pj-dh">
                <span className="pj-dh-mark"><Mark name={area ? area.name : myName} look={meta[selected]} color={tint} personal={selected === ME} /></span>
                <div>
                  <h1>{area ? area.name : myName}</h1>
                  <p>{scope.filter((t) => t.status !== 'done').length} open · {scope.filter((t) => t.status === 'done').length} done · {counters(scope, new Date()).overdue} overdue</p>
                </div>
                <button type="button" className="pj-add" onClick={() => setEditing('new')}><Icon name="add-circle" size={16} /> New Task</button>
              </header>

              {tasks === null ? (
                <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
              ) : (
                <BoardPanel key={selected} workspaceId={selected} />
              )}
            </div>
          </div>
          </>
          )}
        </div>

        {renaming && (() => {
          const target = renaming === ME ? null : areas.find((a) => a.id === renaming);
          if (renaming !== ME && !target) return null;
          return (
            <EditProject
              name={target ? target.name : myName}
              look={meta[renaming]}
              color={target ? color(target.id) : PERSONAL_COLOR}
              personal={renaming === ME}
              onSave={(name, look) => saveProject(renaming, name, look)}
              onClose={() => setRenaming(null)}
            />
          );
        })()}
        {deleting && (() => {
          const target = areas.find((a) => a.id === deleting);
          if (!target) return null;
          return (
            <ConfirmDelete
              name={target.name}
              tasks={(tasks ?? []).filter((t) => t.area_id === deleting).length}
              onArchive={() => { restyle(deleting, { archived: true }); setDeleting(null); }}
              onDelete={() => void deleteProject(deleting)}
              onClose={() => setDeleting(null)}
            />
          );
        })()}
        {creating && (
          <Popup title="New Workspace" onClose={() => { setCreating(false); setNewName(''); }}>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void addClient(); }}>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Workspace Name" aria-label="Workspace Name"
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} />
              <div className="flex justify-end gap-2">
                <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }} onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
                <button type="submit" disabled={!newName.trim()} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', opacity: newName.trim() ? 1 : 0.5 }}>Create Workspace</button>
              </div>
            </form>
          </Popup>
        )}
        {editing && (
          <TaskForm
            areas={areas}
            task={editing === 'new' ? null : editing}
            defaultAreaId={area?.id ?? ''}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }}
            onDeleted={() => { setEditing(null); load(); }}
          />
        )}
      </div>
    </ProjectColorContext.Provider>
  );
}
