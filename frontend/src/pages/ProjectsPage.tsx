import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ComposedChart } from '../components/charts/composed-chart';
import { Grid } from '../components/charts/grid';
import { SeriesBar } from '../components/charts/series-bar';
import { ChartTooltip } from '../components/charts/tooltip';
import { Icon } from '../components/Icon';
import { WeekCalendar } from '../components/projects/calendar';
import { Flow } from '../components/projects/flow';
import { Results } from '../components/projects/results';
import { ConfirmDelete, EditProject, Mark, ProjectMenu, type MenuItem } from '../components/projects/project-edit';
import { Meetings } from '../components/projects/meetings';
import { Team } from '../components/projects/team';
import { Playbook } from '../components/projects/playbook';
import { ProjectColorContext, TaskBoard, TaskForm, TaskListView, apiErrorMessage } from '../components/projects/tasks';
import { TerminalLine } from '../components/TerminalLine';
import { fetchHomeSettings } from '../lib/api';
import { forget, loadMeta, saveMeta, setLook, type Look, type MetaStore } from '../lib/projectMeta';
import { type SortMode, PERSONAL_COLOR, colorOf, counters, firstName, sortAreas, summarize, weekCounts } from '../lib/projects';
import { type Area, type Status, type Task, createArea, deleteArea, deleteTask, fetchAreas, fetchKanban, renameArea, setTaskStatus } from '../lib/tasks-api';
import {
  ABOUT_FIELDS, addWorkspace, loadWorkspaces, removeWorkspace, renameWorkspace, saveWorkspaces, setAbout,
  type WorkspacesData,
} from '../lib/workspaces';

const MIGRATED = 'phibe-projects-synced';
const ME = 'me';
// Alphabetical, always.
const CLIENT_VIEWS = ['Board', 'Calendar', 'Flow', 'Knowledge', 'List', 'Meetings', 'Playbook', 'Results'] as const;
const PLAIN_VIEWS = ['Board', 'Calendar', 'Flow', 'List', 'Meetings', 'Results'] as const;
type View = (typeof CLIENT_VIEWS)[number];

const SORT_KEY = 'phibe-projects-sort';
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'ascending', label: 'Ascending' },
  { id: 'descending', label: 'Descending' },
  { id: 'a-z', label: 'A-Z' },
  { id: 'z-a', label: 'Z-A' },
];
const HOME_TABS = [{ id: 'Projects', icon: 'projects' }, { id: 'Team', icon: 'user-circle' }] as const;

function loadSort(): SortMode {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return SORTS.some((o) => o.id === saved) ? (saved as SortMode) : 'a-z';
  } catch {
    return 'a-z';
  }
}

/** The order of the project cards. The personal card never moves. */
function SortPicker({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
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
      <button type="button" className="fin-range-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="sort" size={16} />
        <span>{SORTS.find((o) => o.id === mode)?.label}</span>
        <Icon name="alt-arrow-down" size={14} />
      </button>
      {open && (
        <div className="fin-range-pop" style={{ width: 170 }} role="listbox" aria-label="Order the projects">
          {SORTS.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={mode === o.id} data-active={mode === o.id} className="fin-range-item" onClick={() => { onChange(o.id); setOpen(false); }}>{o.label}</button>
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
  const [view, setView] = useState<View>('Board');
  const [home, setHome] = useState<'Projects' | 'Team'>('Projects');
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
  const done = scope.filter((t) => t.status === 'done').length;
  const views: readonly View[] = area ? CLIENT_VIEWS : PLAIN_VIEWS;
  const active = views.includes(view) ? view : views[0];
  const tint = area ? color(area.id) : selected === ME ? PERSONAL_COLOR : '#e9ecf5';
  const title = area ? area.name : selected === ME ? `${myName}'s Tasks` : 'Projects';
  const week = useMemo(() => weekCounts(scope, new Date()), [scope]);

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
          {tasks !== null && selected !== null && <TerminalLine text={summarize(scope, new Date())} />}

          {selected === null ? (
            <>
              <header className="fin-header">
                {tasks !== null && <TerminalLine text={summarize(scope, new Date())} />}
                <div className="fin-controls">
                  <div className="fin-actions" role="tablist" aria-label="Projects sections">
                    {HOME_TABS.map((t) => (
                      <button key={t.id} type="button" role="tab" aria-selected={home === t.id} data-active={home === t.id} className="fin-act" aria-label={t.id} onClick={() => setHome(t.id)}>
                        <Icon name={t.icon} size={16} />
                        <span>{t.id}</span>
                      </button>
                    ))}
                    <button type="button" className="fin-btn fin-add" onClick={() => setEditing('new')}><Icon name="add-circle" size={16} /> New Task</button>
                  </div>
                  {home === 'Projects' && (
                    <div className="flex gap-2">
                      {(showArchived || areas.some((a) => meta[a.id]?.archived)) && (
                        <button type="button" className="fin-range-btn" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                          <Icon name="inbox" size={16} />
                          <span>{showArchived ? 'Back To Projects' : `Archived ${areas.filter((a) => meta[a.id]?.archived).length}`}</span>
                        </button>
                      )}
                      <SortPicker mode={sort} onChange={chooseSort} />
                    </div>
                  )}
                </div>
              </header>
              {home === 'Team' ? <Team /> : <>
              {tasks !== null && (() => {
                const c = counters(tasks, new Date());
                return (
                  <div className="pj-counters">
                    <div><b>{c.open}</b><small>Open</small><em style={{ ['--p' as string]: '#ff9d4a' }}>{c.openToday} Today</em></div>
                    <div><b>{c.done}</b><small>Done</small><em style={{ ['--p' as string]: '#20e7aa' }}>+{c.doneWeek} This Week</em></div>
                    <div><b>{c.overdue}</b><small>Overdue</small><em style={{ ['--p' as string]: '#ff6b6b' }}>{c.overdue ? 'Needs Attention' : 'All Clear'}</em></div>
                  </div>
                );
              })()}
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
                {!showArchived && <form className="pj-pcard pj-pnew" onClick={(e) => e.currentTarget.querySelector('input')?.focus()} onSubmit={(e) => { e.preventDefault(); void addClient(); }}>
                  <Icon name="add-circle" size={26} />
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New Project" aria-label="New Project Name" />
                  {newName.trim() && <button type="submit" className="pj-add">Create Project</button>}
                </form>}
              </div>
              </>}
            </>
          ) : (
          <>
          <div className="pj-top">
            <button type="button" className="pj-back" onClick={() => setSelected(null)}><Icon name="alt-arrow-down" size={16} />Projects</button>
            <div className="pj-card" style={{ ['--c' as string]: tint }}>
              <div>
                <h1>{title}</h1>
                <button type="button" className="pj-add mt-3" onClick={() => setEditing('new')}><Icon name="add-circle" size={16} /> New Task</button>
              </div>
              <div className="pj-big">
                <b style={{ color: tint }}>{scope.length ? Math.round((100 * done) / scope.length) : 0}%</b>
                <small>{done} of {scope.length} tasks done</small>
              </div>
              <div className="pj-chart">
                <ComposedChart data={week} xDataKey="date" aspectRatio="16 / 7" barGap={2} maxBarSize={18} margin={{ top: 8, right: 6, bottom: 4, left: 6 }}>
                  <Grid horizontal numTicksRows={3} />
                  <SeriesBar dataKey="done" fill="#20e7aa" radius={4} />
                  <SeriesBar dataKey="open" fill="#10c3d3" radius={4} />
                  <ChartTooltip showCrosshair={false} dotSize={6} rows={(p) => [{ color: '#20e7aa', label: 'Done', value: String(p.done) }, { color: '#10c3d3', label: 'Open', value: String(p.open) }]} />
                </ComposedChart>
                <div className="pj-days">{week.map((d) => <span key={d.date.getTime()} data-today={d.date.toDateString() === new Date().toDateString()}>{d.date.toLocaleDateString('en', { weekday: 'narrow' })}</span>)}</div>
              </div>
            </div>
          </div>

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
              {active === 'Board' && <TaskBoard tasks={scope} onOpen={setEditing} onMove={(id, st) => void move(id, st)} />}
              {active === 'Calendar' && <WeekCalendar tasks={scope} colorOf={color} onOpen={setEditing} />}
              {active === 'Flow' && <Flow projectId={selected} />}
              {active === 'Knowledge' && workspace && <Knowledge data={data} id={workspace.id} onChange={setData} />}
              {active === 'List' && <TaskListView tasks={scope} onOpen={setEditing} onToggleDone={(t) => void move(t.id, t.status === 'done' ? 'todo' : 'done')} />}
              {active === 'Meetings' && selected && <Meetings projectId={selected} />}
              {active === 'Results' && <Results tasks={scope} color={tint} />}
              {active === 'Playbook' && workspace && <Playbook data={data} workspace={workspace} onChange={setData} onRename={rename} onDelete={remove} />}
            </>
          )}
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
