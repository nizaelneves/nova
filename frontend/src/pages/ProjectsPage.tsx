import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ComposedChart } from '../components/charts/composed-chart';
import { Grid } from '../components/charts/grid';
import { SeriesBar } from '../components/charts/series-bar';
import { ChartTooltip } from '../components/charts/tooltip';
import { Icon } from '../components/Icon';
import { WeekCalendar } from '../components/projects/calendar';
import { Flow } from '../components/projects/flow';
import { Playbook } from '../components/projects/playbook';
import { ProjectColorContext, TaskBoard, TaskForm, TaskListView, apiErrorMessage } from '../components/projects/tasks';
import { TerminalLine } from '../components/TerminalLine';
import { fetchHomeSettings } from '../lib/api';
import { PERSONAL_COLOR, colorOf, firstName, summarize, weekCounts } from '../lib/projects';
import { type Area, type Status, type Task, createArea, deleteArea, fetchAreas, fetchKanban, renameArea, setTaskStatus } from '../lib/tasks-api';
import {
  ABOUT_FIELDS, addWorkspace, loadWorkspaces, removeWorkspace, renameWorkspace, saveWorkspaces, setAbout,
  type WorkspacesData,
} from '../lib/workspaces';

const MIGRATED = 'phibe-projects-synced';
const ALL = 'all';
const ME = 'me';
// Alphabetical, always.
const CLIENT_VIEWS = ['Board', 'Calendar', 'Flow', 'Knowledge', 'List', 'Meetings', 'Playbook', 'Results'] as const;
const PLAIN_VIEWS = ['Board', 'Calendar', 'Flow', 'List'] as const;
type View = (typeof CLIENT_VIEWS)[number];

/** The round mark of a project: an icon for All and for the user, initials for a client. */
function Mark({ id, name, color }: { id: string; name: string; color: string }) {
  return (
    <span className="pj-mark" style={{ ['--c' as string]: color }} aria-hidden="true">
      {id === ALL ? <Icon name="projects" size={16} /> : id === ME ? <Icon name="user-circle" size={16} /> : name.slice(0, 2).toUpperCase()}
    </span>
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
  const [selected, setSelected] = useState(ALL);
  const [view, setView] = useState<View>('Board');
  const [editing, setEditing] = useState<Task | null | 'new'>(null);
  const [myName, setMyName] = useState('Personal');
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const synced = useRef(false);
  const menu = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchAreas().then(setAreas).catch(() => setAreas([]));
    fetchKanban().then((columns) => setTasks(Object.values(columns).flat())).catch(() => setTasks([]));
  }, []);

  useEffect(load, [load]);
  useEffect(() => { saveWorkspaces(data); }, [data]);
  useEffect(() => { fetchHomeSettings().then((h) => setMyName(firstName(h.display_name))).catch(() => undefined); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

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
  const scope = (tasks ?? []).filter((t) => (selected === ALL ? true : selected === ME ? !t.area_id : t.area_id === selected));
  const done = scope.filter((t) => t.status === 'done').length;
  const views: readonly View[] = area ? CLIENT_VIEWS : PLAIN_VIEWS;
  const active = views.includes(view) ? view : views[0];
  const tint = area ? color(area.id) : selected === ME ? PERSONAL_COLOR : '#e9ecf5';
  const title = area ? area.name : selected === ME ? `${myName}'s Tasks` : 'All Projects';
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
      setOpen(false);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const rename = (name: string) => {
    if (!area || !workspace || !name.trim()) return;
    renameArea(area.id, name.trim()).then(() => { setData((d) => renameWorkspace(d, workspace.id, name)); load(); }).catch((err) => toast.error(apiErrorMessage(err)));
  };

  const remove = () => {
    if (!area || !workspace) return;
    if (scope.length) { toast.error('This project still has tasks. Move or delete them first.'); return; }
    deleteArea(area.id)
      .then(() => { setData((d) => removeWorkspace(d, workspace.id)); setSelected(ALL); load(); })
      .catch((err) => toast.error(apiErrorMessage(err)));
  };

  const choose = (id: string) => { setSelected(id); setOpen(false); };

  return (
    <ProjectColorContext.Provider value={color}>
      <div className="pj-root h-full overflow-y-auto">
        <div className="pj-wrap">
          {tasks !== null && <TerminalLine text={summarize(scope, new Date())} />}

          <div className="pj-top">
            <div className="pj-select" ref={menu}>
              <button type="button" className="pj-select-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <Mark id={selected} name={title} color={tint} />
                <span>{title}</span>
                <Icon name="alt-arrow-down" size={16} />
              </button>
              {open && (
                <div className="pj-select-menu" role="listbox">
                  {[{ id: ALL, name: 'All Projects', c: '#e9ecf5' }, { id: ME, name: myName, c: PERSONAL_COLOR }, ...areas.map((a) => ({ id: a.id, name: a.name, c: color(a.id) }))].map((o) => (
                    <button key={o.id} type="button" role="option" aria-selected={selected === o.id} className="pj-opt" data-on={selected === o.id} onClick={() => choose(o.id)}>
                      <Mark id={o.id} name={o.name} color={o.c} />
                      {o.name}
                    </button>
                  ))}
                  <form className="pj-opt" onSubmit={(e) => { e.preventDefault(); void addClient(); }}>
                    <Icon name="add-circle" size={18} />
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New Project" aria-label="New Project name" />
                  </form>
                </div>
              )}
            </div>

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
                {v}{(v === 'Meetings' || v === 'Results') && <em>soon</em>}
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
              {(active === 'Meetings' || active === 'Results') && <div className="pj-soon">{active} for this project are coming soon.</div>}
              {active === 'Playbook' && workspace && <Playbook data={data} workspace={workspace} onChange={setData} onRename={rename} onDelete={remove} />}
            </>
          )}
        </div>

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
