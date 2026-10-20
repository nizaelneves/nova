import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon, type IconName } from '../components/Icon';
import { Popup } from '../components/Popup';
import { ConfirmDelete, EditProject, Mark, ProjectMenu, type MenuItem } from '../components/projects/project-edit';
import { Playbook } from '../components/projects/playbook';
import { WorkspaceSidebar } from '../components/projects/sidebar';
import { ProjectColorContext, TaskBoard, TaskForm, TaskListView, apiErrorMessage } from '../components/projects/tasks';
import { TerminalLine } from '../components/TerminalLine';
import { fetchHomeSettings } from '../lib/api';
import { forget, loadMeta, saveMeta, setLook, type Look, type MetaStore } from '../lib/projectMeta';
import { type SortMode, PERSONAL_COLOR, colorOf, counters, firstName, sortAreas, summarize } from '../lib/projects';
import { type Area, type Status, type Task, createArea, deleteArea, deleteTask, fetchAreas, fetchKanban, renameArea, setTaskStatus } from '../lib/tasks-api';
import {
  ABOUT_FIELDS, addWorkspace, loadWorkspaces, removeWorkspace, renameWorkspace, saveWorkspaces, setAbout,
  type WorkspacesData,
} from '../lib/workspaces';

const MIGRATED = 'phibe-projects-synced';
const ME = 'me';
// Alphabetical, always.
const CLIENT_VIEWS = ['Kanban', 'Knowledge', 'List', 'Playbook'] as const;
const PLAIN_VIEWS = ['Kanban', 'List'] as const;
type View = (typeof CLIENT_VIEWS)[number];

const SORT_KEY = 'phibe-projects-sort';
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'ascending', label: 'Ascending' },
  { id: 'descending', label: 'Descending' },
  { id: 'a-z', label: 'A-Z' },
  { id: 'z-a', label: 'Z-A' },
];
const HOME_TABS = [{ id: 'Workspaces', icon: 'buildings-2' }, { id: 'Tasks', icon: 'checklist-minimalistic' }] as const;
type Home = (typeof HOME_TABS)[number]['id'];

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

function Knowledge({ data, id, onChange }: { data: WorkspacesData; id: string; onChange: (next: WorkspacesData) => void }) {
  const about = data.workspaces.find((w) => w.id === id)?.about ?? {};
  return (
    <div className="pj-grid">
      {ABOUT_FIELDS.map((field) => (
        <label key={field} className="pj-note">
          <h4>{field}</h4>
          <textarea key={id + field} defaultValue={about[field] ?? ''} rows={4} placeholder="Write what the team should know." onBlur={(e) => onChange(setAbout(data, id, field, e.target.value))} />
        </label>
      ))}
    </div>
  );
}

export function ProjectsPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [data, setData] = useState<WorkspacesData>(loadWorkspaces);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('Kanban');
  const [creating, setCreating] = useState(false);
  const [home, setHome] = useState<Home>('Workspaces');
  const [filter, setFilter] = useState<string>('all');
  const [tview, setTview] = useState<'Kanban' | 'List'>('List');
  const [meta, setMeta] = useState<MetaStore>(loadMeta);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>(loadSort);
  const chooseSort = (m: SortMode) => { setSort(m); try { localStorage.setItem(SORT_KEY, m); } catch { /* not remembered */ } };
  const [editing, setEditing] = useState<Task | null | 'new'>(null);
  const [myName, setMyName] = useState('Personal');
  const [newName, setNewName] = useState('');
  const synced = useRef(false);

  const load = useCallback(() => {
    fetchAreas().then(setAreas).catch(() => setAreas([]));
    fetchKanban().then((columns) => setTasks(Object.values(columns).flat())).catch(() => setTasks([]));
  }, []);

  useEffect(load, [load]);
  useEffect(() => { saveWorkspaces(data); }, [data]);
  useEffect(() => { saveMeta(meta); }, [meta]);
  useEffect(() => { fetchHomeSettings().then((h) => setMyName(firstName(h.display_name))).catch(() => undefined); }, []);

  // A project is a client (workspace) and a task area with the same name. The first time, create whichever side is
  // missing (clients from the old Workspaces screen get an area). After that the areas are the truth: a client whose
  // area is gone is dropped, so a deleted project never comes back.
  useEffect(() => {
    if (synced.current || tasks === null) return;
    synced.current = true;
    let migrated = false;
    try { migrated = localStorage.getItem(MIGRATED) === '1'; } catch { /* storage blocked: treat as first run */ }
    const names = new Set(areas.map((a) => a.name.toLowerCase()));
    const known = new Set(data.workspaces.map((w) => w.name.toLowerCase()));
    const missingAreas = data.workspaces.filter((w) => !names.has(w.name.toLowerCase()));
    const missingClients = areas.filter((a) => !known.has(a.name.toLowerCase()));
    setData((d) => {
      const kept = migrated ? missingAreas.reduce((acc, w) => removeWorkspace(acc, w.id), d) : d;
      return missingClients.reduce((acc, a) => addWorkspace(acc, a.name), kept);
    });
    if (!migrated) {
      void Promise.all(missingAreas.map((w) => createArea(w.name).catch(() => undefined))).then(load);
      try { localStorage.setItem(MIGRATED, '1'); } catch { /* retried next time */ }
    }
  }, [areas, tasks, data.workspaces, load]);

  const color = useMemo(() => colorOf(areas), [areas]);
  const area = areas.find((a) => a.id === selected) ?? null;
  const workspace = area ? data.workspaces.find((w) => w.name.toLowerCase() === area.name.toLowerCase()) ?? null : null;
  const scope = (tasks ?? []).filter((t) => (selected === null ? true : selected === ME ? !t.area_id : t.area_id === selected));
  const views: readonly View[] = area ? CLIENT_VIEWS : PLAIN_VIEWS;
  const active = views.includes(view) ? view : views[0];
  const tasksScope = (tasks ?? []).filter((t) => (filter === 'all' ? true : filter === ME ? !t.area_id : t.area_id === filter));
  const filterOptions = [{ id: 'all', label: 'All Workspaces' }, { id: ME, label: myName }, ...sortAreas(areas, 'a-z').map((a) => ({ id: a.id, label: a.name }))];
  const tint = area ? color(area.id) : selected === ME ? PERSONAL_COLOR : '#e9ecf5';

  const move = async (id: string, status: Status) => {
    setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status } : t)) ?? prev);
    try { await setTaskStatus(id, status); } catch (err) { toast.error(apiErrorMessage(err)); } finally { load(); }
  };

  const addClient = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createArea(name);
      setData((d) => addWorkspace(d, name));
      setSelected(created.id);
      setNewName('');
      setCreating(false);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const rename = (name: string) => {
    if (!area || !workspace || !name.trim()) return;
    renameArea(area.id, name.trim()).then(() => { setData((d) => renameWorkspace(d, workspace.id, name)); load(); }).catch((err) => toast.error(apiErrorMessage(err)));
  };

  const restyle = (id: string, changes: Partial<Look>) => setMeta((m) => setLook(m, id, changes));

  const saveProject = (id: string, name: string, look: Pick<Look, 'icon' | 'image'>) => {
    restyle(id, look);
    const target = areas.find((a) => a.id === id);
    const client = target && data.workspaces.find((w) => w.name.toLowerCase() === target.name.toLowerCase());
    if (target && client && name && name !== target.name) {
      renameArea(id, name).then(() => { setData((d) => renameWorkspace(d, client.id, name)); load(); }).catch((err) => toast.error(apiErrorMessage(err)));
    }
    setRenaming(null);
  };

  const deleteProject = async (id: string) => {
    const target = areas.find((a) => a.id === id);
    const client = target && data.workspaces.find((w) => w.name.toLowerCase() === target.name.toLowerCase());
    if (!target) return;
    try {
      await Promise.all((tasks ?? []).filter((t) => t.area_id === id).map((t) => deleteTask(t.id)));
      await deleteArea(id);
      if (client) setData((d) => removeWorkspace(d, client.id));
      setMeta((m) => forget(m, id));
      setDeleting(null);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const remove = () => {
    if (!area || !workspace) return;
    if (scope.length) { toast.error('This project still has tasks. Move or delete them first.'); return; }
    deleteArea(area.id)
      .then(() => { setData((d) => removeWorkspace(d, workspace.id)); setSelected(null); load(); })
      .catch((err) => toast.error(apiErrorMessage(err)));
  };

  return (
    <ProjectColorContext.Provider value={color}>
      <div className="pj-root h-full overflow-y-auto">
        <div className="pj-wrap">
          {selected === null ? (
            <>
              <header className="fin-header pj-head">
                {tasks !== null && home === 'Workspaces' && <TerminalLine text={summarize(scope, new Date())} />}
                <div className="fin-controls">
                  <div className="fin-actions" role="tablist" aria-label="Projects sections">
                    {HOME_TABS.map((t) => (
                      <button key={t.id} type="button" role="tab" aria-selected={home === t.id} data-active={home === t.id} className="fin-act" aria-label={t.id} onClick={() => setHome(t.id)}>
                        <Icon name={t.icon} size={16} />
                        <span>{t.id}</span>
                      </button>
                    ))}
                    <button type="button" className="fin-btn fin-add" onClick={() => setCreating(true)}><Icon name="add-circle" size={16} /> New Workspace</button>
                    <button type="button" className="fin-btn fin-add" onClick={() => setEditing('new')}><Icon name="add-circle" size={16} /> New Task</button>
                  </div>
                  {home === 'Workspaces' ? (
                    <div className="flex gap-2">
                      {(showArchived || areas.some((a) => meta[a.id]?.archived)) && (
                        <button type="button" className="fin-range-btn" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                          <Icon name="inbox" size={16} />
                          <span>{showArchived ? 'Back To Workspaces' : `Archived ${areas.filter((a) => meta[a.id]?.archived).length}`}</span>
                        </button>
                      )}
                      <Picker icon="sort" label="Order the workspaces" options={SORTS} value={sort} onChange={chooseSort} />
                    </div>
                  ) : (
                    <Picker icon="folder" label="Filter by workspace" options={filterOptions} value={filter} onChange={setFilter} />
                  )}
                </div>
              </header>
              {home === 'Tasks' ? (
                <>
                  {tasks !== null && (() => {
                    const c = counters(tasksScope, new Date());
                    return (
                      <div className="pj-counters">
                        <div><b>{tasksScope.length}</b><small>Total</small><em style={{ ['--p' as string]: '#7dd3fc' }}>{filterOptions.find((o) => o.id === filter)?.label}</em></div>
                        <div><b>{c.done}</b><small>Completed</small><em style={{ ['--p' as string]: '#20e7aa' }}>+{c.doneWeek} This Week</em></div>
                        <div><b>{c.open}</b><small>Incomplete</small><em style={{ ['--p' as string]: '#ff9d4a' }}>{c.openToday} Today</em></div>
                        <div><b>{c.overdue}</b><small>Overdue</small><em style={{ ['--p' as string]: '#ff6b6b' }}>{c.overdue ? 'Needs Attention' : 'All Clear'}</em></div>
                      </div>
                    );
                  })()}
                  {tasks === null ? (
                    <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
                  ) : (
                    <>
                      <div className="pj-tabs" role="tablist" style={{ ['--c' as string]: '#20e7aa' }}>
                        {(['Kanban', 'List'] as const).map((v) => (
                          <button key={v} type="button" role="tab" aria-selected={tview === v} data-on={tview === v} onClick={() => setTview(v)}>{v}</button>
                        ))}
                      </div>
                      {tview === 'Kanban'
                        ? <TaskBoard tasks={tasksScope} onOpen={setEditing} onMove={(id, st) => void move(id, st)} />
                        : <TaskListView tasks={tasksScope} onOpen={setEditing} onToggleDone={(t) => void move(t.id, t.status === 'done' ? 'todo' : 'done')} />}
                    </>
                  )}
                </>
              ) : (<>
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
              </>)}
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

              <div className="pj-tabs" style={{ ['--c' as string]: tint }} role="tablist">
                {views.map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={active === v} data-on={active === v} onClick={() => setView(v)}>
                    {v}
                  </button>
                ))}
              </div>

              {tasks === null ? (
                <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
              ) : (
                <>
                  {active === 'Kanban' && <TaskBoard tasks={scope} onOpen={setEditing} onMove={(id, st) => void move(id, st)} />}
                  {active === 'Knowledge' && workspace && <Knowledge data={data} id={workspace.id} onChange={setData} />}
                  {active === 'List' && <TaskListView tasks={scope} onOpen={setEditing} onToggleDone={(t) => void move(t.id, t.status === 'done' ? 'todo' : 'done')} />}
                  {active === 'Playbook' && workspace && <Playbook data={data} workspace={workspace} onChange={setData} onRename={rename} onDelete={remove} />}
                </>
              )}
            </div>
            <WorkspaceSidebar id={selected} tasks={scope} color={tint} />
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
