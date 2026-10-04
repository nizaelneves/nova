import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Popup } from '../components/Popup';
import { todayLocal } from '../lib/tasks-api';
import {
  type Activity,
  type Playbook,
  type Stage,
  type Template,
  type WorkspacesData,
  addActivity,
  addPlaybook,
  addPlaybookStep,
  addStage,
  addTemplate,
  addWorkspace,
  currentStageId,
  duplicateTemplate,
  isOverdue,
  loadWorkspaces,
  moveStage,
  movePlaybookStep,
  playbookDays,
  progress,
  removeActivity,
  removePlaybook,
  removePlaybookStep,
  removeStage,
  removeTemplate,
  removeWorkspace,
  renameStage,
  renameWorkspace,
  saveWorkspaces,
  toggleStep,
  toggleWorkspacePlaybook,
  updateActivity,
  updatePlaybook,
  updatePlaybookStep,
  updateTemplate,
} from '../lib/workspaces';

type Tab = 'activities' | 'playbooks' | 'templates' | 'stages';
const TABS: { id: Tab; label: string }[] = [
  { id: 'activities', label: 'Activities' },
  { id: 'playbooks', label: 'Playbooks' },
  { id: 'templates', label: 'Templates' },
  { id: 'stages', label: 'Stages' },
];

const FIELD: React.CSSProperties = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
};
const FIELD_CLS = 'text-sm px-3 py-1.5 rounded-lg outline-none w-full';
const PRIMARY: React.CSSProperties = { background: 'var(--color-accent)', color: 'var(--color-on-accent)' };
const MUTED: React.CSSProperties = { color: 'var(--color-text-tertiary)' };

function formatDate(date: string): string {
  return new Date(`${date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRange(a: { start: string; due: string }): string {
  return a.start === a.due ? formatDate(a.start) : `${formatDate(a.start)} – ${formatDate(a.due)}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-secondary)' }}>{children}</span>;
}

function Button({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-default"
      style={primary ? PRIMARY : { background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
    >
      {children}
    </button>
  );
}

function IconButton({ name, label, onClick, disabled }: { name: 'trash-bin-minimalistic' | 'arrow-up' | 'arrow-down'; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="p-1 rounded cursor-pointer disabled:opacity-30 disabled:cursor-default"
      style={MUTED}
    >
      <Icon name={name} size={15} />
    </button>
  );
}

function StageSelect({ stages, value, onChange }: { stages: Stage[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLS} style={FIELD}>
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

// ------------------------------------------------------------------ activities

function NewActivityPopup({ data, workspaceId, onCreate, onClose }: {
  data: WorkspacesData;
  workspaceId: string;
  onCreate: (input: { workspaceId: string; title: string; playbookId: string | null; start: string; due: string; notes: string }) => void;
  onClose: () => void;
}) {
  const [ws, setWs] = useState(workspaceId || data.workspaces[0]?.id || '');
  const [title, setTitle] = useState('');
  const [playbookId, setPlaybookId] = useState('');
  const [start, setStart] = useState(todayLocal());
  const [due, setDue] = useState('');
  const [templateId, setTemplateId] = useState('');
  const workspace = data.workspaces.find((w) => w.id === ws);
  const playbooks = workspace && workspace.playbookIds.length > 0 ? data.playbooks.filter((p) => workspace.playbookIds.includes(p.id)) : data.playbooks;
  const chosen = data.playbooks.find((p) => p.id === playbookId);
  const notes = data.templates.find((t) => t.id === templateId)?.body ?? '';

  return (
    <Popup title="New activity" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div>
          <Label>Workspace</Label>
          <select value={ws} onChange={(e) => { setWs(e.target.value); setPlaybookId(''); }} className={FIELD_CLS} style={FIELD}>
            {data.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Activity</Label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch client X campaign" className={FIELD_CLS} style={FIELD} />
        </div>
        <div>
          <Label>Playbook (service flow)</Label>
          <select value={playbookId} onChange={(e) => setPlaybookId(e.target.value)} className={FIELD_CLS} style={FIELD}>
            <option value="">No playbook</option>
            {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name} · {playbookDays(p)} days</option>)}
          </select>
          {chosen && <p className="text-xs mt-1" style={MUTED}>{chosen.steps.length} steps are scheduled one after another from the start date.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start date</Label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={FIELD_CLS} style={FIELD} /></div>
          <div><Label>Due date{chosen ? ' (optional)' : ''}</Label><input type="date" value={due} min={start} onChange={(e) => setDue(e.target.value)} className={FIELD_CLS} style={FIELD} /></div>
        </div>
        <div>
          <Label>Start from a template (optional)</Label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={FIELD_CLS} style={FIELD}>
            <option value="">Blank notes</option>
            {data.templates.map((t) => <option key={t.id} value={t.id}>{t.kind} · {t.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!title.trim() || !ws || !start} onClick={() => { onCreate({ workspaceId: ws, title, playbookId: playbookId || null, start, due, notes }); onClose(); }}>Create</Button>
        </div>
      </div>
    </Popup>
  );
}

function ActivityPopup({ data, activity, onChange, onClose }: {
  data: WorkspacesData;
  activity: Activity;
  onChange: (next: WorkspacesData) => void;
  onClose: () => void;
}) {
  const workspace = data.workspaces.find((w) => w.id === activity.workspaceId);
  const playbook = data.playbooks.find((p) => p.id === activity.playbookId);
  const stageName = (id: string) => data.stages.find((s) => s.id === id)?.name ?? '';
  const hasSteps = activity.steps.length > 0;
  const stageId = currentStageId(activity, data.stages);
  return (
    <Popup title={workspace?.name ?? 'Activity'} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <input
          defaultValue={activity.title}
          onBlur={(e) => onChange(updateActivity(data, activity.id, { title: e.target.value }))}
          className={`${FIELD_CLS} font-semibold`}
          style={FIELD}
          aria-label="Activity title"
        />
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start date</Label><input type="date" value={activity.start} onChange={(e) => onChange(updateActivity(data, activity.id, { start: e.target.value }))} className={FIELD_CLS} style={FIELD} /></div>
          <div><Label>Due date</Label><input type="date" value={activity.due} min={activity.start} onChange={(e) => onChange(updateActivity(data, activity.id, { due: e.target.value }))} className={FIELD_CLS} style={FIELD} /></div>
        </div>
        <div>
          <Label>Stage{hasSteps ? ' (follows the steps)' : ''}</Label>
          {hasSteps
            ? <div className="text-sm px-3 py-1.5 rounded-lg" style={FIELD}>{stageName(stageId)}</div>
            : <StageSelect stages={data.stages} value={activity.stageId} onChange={(id) => onChange(updateActivity(data, activity.id, { stageId: id }))} />}
        </div>
        {hasSteps && (
          <div>
            <Label>{playbook ? `${playbook.name} steps` : 'Steps'}</Label>
            <ul className="flex flex-col gap-1">
              {activity.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <input type="checkbox" checked={s.done} onChange={() => onChange(toggleStep(data, activity.id, s.id))} aria-label={`Done: ${s.title}`} />
                  <span className="flex-1" style={{ color: 'var(--color-text)', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.6 : 1 }}>{s.title}</span>
                  <span className="text-xs" style={MUTED}>{stageName(s.stageId)}</span>
                  <span className="text-xs w-24 text-right" style={MUTED}>{formatRange(s)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <Label>Notes</Label>
          <textarea
            defaultValue={activity.notes}
            onBlur={(e) => onChange(updateActivity(data, activity.id, { notes: e.target.value }))}
            rows={6}
            className={`${FIELD_CLS} font-mono text-xs`}
            style={FIELD}
          />
        </div>
        <div className="flex justify-between mt-1">
          <Button onClick={() => { onChange(removeActivity(data, activity.id)); onClose(); }}>Delete</Button>
          <Button primary onClick={onClose}>Done</Button>
        </div>
      </div>
    </Popup>
  );
}

function ActivityCard({ data, activity, showWorkspace, today, onOpen }: { data: WorkspacesData; activity: Activity; showWorkspace: boolean; today: string; onOpen: () => void }) {
  const p = progress(activity);
  const late = isOverdue(activity, data.stages, today);
  const workspace = data.workspaces.find((w) => w.id === activity.workspaceId);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left w-full rounded-xl p-3 cursor-pointer flex flex-col gap-1.5"
      style={{ background: 'var(--color-bg-secondary)', border: `1px solid ${late ? 'var(--color-error)' : 'var(--color-border)'}` }}
    >
      {showWorkspace && <span className="text-xs" style={MUTED}>{workspace?.name}</span>}
      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{activity.title}</span>
      <span className="text-xs flex items-center gap-1.5" style={{ color: late ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
        <Icon name="calendar" size={13} />{formatRange(activity)}{late ? ' · overdue' : ''}
      </span>
      {p.total > 0 && (
        <span className="flex items-center gap-2">
          <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
            <span className="block h-full" style={{ width: `${(p.done / p.total) * 100}%`, background: 'var(--color-accent)' }} />
          </span>
          <span className="text-xs" style={MUTED}>{p.done}/{p.total}</span>
        </span>
      )}
    </button>
  );
}

function ActivitiesTab({ data, onChange }: { data: WorkspacesData; onChange: (next: WorkspacesData) => void }) {
  const [selected, setSelected] = useState<string>('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);
  const today = todayLocal();
  const workspace = data.workspaces.find((w) => w.id === selected) ?? null;
  const activities = data.activities
    .filter((a) => !workspace || a.workspaceId === workspace.id)
    .sort((a, b) => a.due.localeCompare(b.due));
  const open = data.activities.find((a) => a.id === openId) ?? null;

  const addClient = () => {
    const next = addWorkspace(data, newName);
    if (next === data) return;
    onChange(next);
    setSelected(next.workspaces[next.workspaces.length - 1].id);
    setNewName('');
  };

  return (
    <div className="flex gap-4 flex-col md:flex-row">
      <aside className="md:w-56 shrink-0 flex flex-col gap-1">
        {[{ id: 'all', name: 'All workspaces' }, ...data.workspaces].map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => { setSelected(w.id); setEditing(false); }}
            data-active={selected === w.id}
            className="text-left text-sm px-3 py-2 rounded-lg cursor-pointer flex items-center gap-2"
            style={{
              background: selected === w.id ? 'var(--color-bg-secondary)' : 'transparent',
              color: selected === w.id ? 'var(--color-text)' : 'var(--color-text-secondary)',
              border: `1px solid ${selected === w.id ? 'var(--color-border)' : 'transparent'}`,
            }}
          >
            <Icon name="buildings-2" size={16} />
            <span className="flex-1 truncate">{w.name}</span>
          </button>
        ))}
        <div className="flex gap-1 mt-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} placeholder="New workspace" className={FIELD_CLS} style={FIELD} />
          <button type="button" aria-label="Add workspace" onClick={addClient} disabled={!newName.trim()} className="px-2 rounded-lg cursor-pointer disabled:opacity-50" style={PRIMARY}>
            <Icon name="add-circle" size={18} />
          </button>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col gap-3">
        {data.workspaces.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-sm" style={{ border: '1px dashed var(--color-border)', ...MUTED }}>
            Create a workspace for each client to start adding activities.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold mr-auto" style={{ color: 'var(--color-heading)' }}>{workspace ? workspace.name : 'All workspaces'}</h2>
              {workspace && <Button onClick={() => setEditing((v) => !v)}>{editing ? 'Close settings' : 'Settings'}</Button>}
              <div className="pings-tab-pill" style={{ padding: '0.2rem' }}>
                {(['board', 'list'] as const).map((v) => (
                  <button key={v} type="button" data-active={view === v} onClick={() => setView(v)} className="pings-tab-pill-item" style={{ padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}>
                    {v === 'board' ? 'Board' : 'List'}
                  </button>
                ))}
              </div>
              <Button primary onClick={() => setCreating(true)}>New activity</Button>
            </div>

            {workspace && editing && (
              <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <div>
                  <Label>Name</Label>
                  <input defaultValue={workspace.name} key={workspace.id} onBlur={(e) => onChange(renameWorkspace(data, workspace.id, e.target.value))} className={FIELD_CLS} style={FIELD} />
                </div>
                <div>
                  <Label>Services this client contracted (playbooks)</Label>
                  <div className="flex gap-2 flex-wrap">
                    {data.playbooks.map((p) => {
                      const on = workspace.playbookIds.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => onChange(toggleWorkspacePlaybook(data, workspace.id, p.id))} className="text-xs px-3 py-1 rounded-full cursor-pointer" style={on ? PRIMARY : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs mt-1" style={MUTED}>Only these flows are offered for this client. With none selected, all are.</p>
                </div>
                <div><Button onClick={() => { onChange(removeWorkspace(data, workspace.id)); setSelected('all'); setEditing(false); }}>Delete workspace and its activities</Button></div>
              </div>
            )}

            {activities.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm" style={{ border: '1px dashed var(--color-border)', ...MUTED }}>No activities yet.</div>
            ) : view === 'board' ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {data.stages.map((stage) => {
                  const items = activities.filter((a) => currentStageId(a, data.stages) === stage.id);
                  return (
                    <div key={stage.id} className="w-64 shrink-0 flex flex-col gap-2">
                      <div className="text-xs font-semibold uppercase flex items-center gap-2" style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}>
                        {stage.name}<span style={MUTED}>{items.length}</span>
                      </div>
                      {items.map((a) => <ActivityCard key={a.id} data={data} activity={a} showWorkspace={!workspace} today={today} onOpen={() => setOpenId(a.id)} />)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {activities.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <div className="flex-1"><ActivityCard data={data} activity={a} showWorkspace={!workspace} today={today} onOpen={() => setOpenId(a.id)} /></div>
                    <span className="text-xs w-28" style={MUTED}>{data.stages.find((s) => s.id === currentStageId(a, data.stages))?.name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {creating && (
        <NewActivityPopup
          data={data}
          workspaceId={workspace?.id ?? ''}
          onCreate={(input) => onChange(addActivity(data, input))}
          onClose={() => setCreating(false)}
        />
      )}
      {open && <ActivityPopup data={data} activity={open} onChange={onChange} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ playbooks

function PlaybookEditor({ data, playbook, onChange, onDelete }: { data: WorkspacesData; playbook: Playbook; onChange: (next: WorkspacesData) => void; onDelete: () => void }) {
  const [title, setTitle] = useState('');
  const [stageId, setStageId] = useState(data.stages[0].id);
  const [days, setDays] = useState('1');
  const add = () => {
    onChange(addPlaybookStep(data, playbook.id, title, stageId, Number(days)));
    setTitle('');
  };
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
      <div className="flex gap-2 items-center">
        <input defaultValue={playbook.name} onBlur={(e) => onChange(updatePlaybook(data, playbook.id, { name: e.target.value }))} className={`${FIELD_CLS} font-semibold`} style={FIELD} aria-label="Playbook name" />
        <span className="text-xs whitespace-nowrap" style={MUTED}>{playbookDays(playbook)} days</span>
        <IconButton name="trash-bin-minimalistic" label="Delete playbook" onClick={onDelete} />
      </div>
      <input defaultValue={playbook.description} onBlur={(e) => onChange(updatePlaybook(data, playbook.id, { description: e.target.value }))} placeholder="What this service flow covers" className={FIELD_CLS} style={FIELD} aria-label="Playbook description" />
      <ol className="flex flex-col gap-1.5">
        {playbook.steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className="text-xs w-5 text-center" style={MUTED}>{i + 1}</span>
            <input defaultValue={s.title} onBlur={(e) => onChange(updatePlaybookStep(data, playbook.id, s.id, { title: e.target.value }))} className={FIELD_CLS} style={FIELD} aria-label="Step title" />
            <div className="w-40 shrink-0"><StageSelect stages={data.stages} value={s.stageId} onChange={(id) => onChange(updatePlaybookStep(data, playbook.id, s.id, { stageId: id }))} /></div>
            <input type="number" min={1} defaultValue={s.days} onBlur={(e) => onChange(updatePlaybookStep(data, playbook.id, s.id, { days: Number(e.target.value) }))} className={`${FIELD_CLS} !w-16`} style={FIELD} aria-label="Days" />
            <span className="text-xs" style={MUTED}>d</span>
            <IconButton name="arrow-up" label="Move up" disabled={i === 0} onClick={() => onChange(movePlaybookStep(data, playbook.id, s.id, -1))} />
            <IconButton name="arrow-down" label="Move down" disabled={i === playbook.steps.length - 1} onClick={() => onChange(movePlaybookStep(data, playbook.id, s.id, 1))} />
            <IconButton name="trash-bin-minimalistic" label="Delete step" onClick={() => onChange(removePlaybookStep(data, playbook.id, s.id))} />
          </li>
        ))}
      </ol>
      <div className="flex gap-2 items-center">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New step" className={FIELD_CLS} style={FIELD} />
        <div className="w-40 shrink-0"><StageSelect stages={data.stages} value={stageId} onChange={setStageId} /></div>
        <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={`${FIELD_CLS} !w-16`} style={FIELD} aria-label="Days for new step" />
        <span className="text-xs" style={MUTED}>d</span>
        <Button onClick={add} disabled={!title.trim()}>Add step</Button>
      </div>
    </div>
  );
}

function PlaybooksTab({ data, onChange }: { data: WorkspacesData; onChange: (next: WorkspacesData) => void }) {
  const [name, setName] = useState('');
  const add = () => {
    onChange(addPlaybook(data, name));
    setName('');
  };
  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        A playbook is a service flow: the steps, the stage each belongs to and how many days each takes. Use it on any activity to schedule the steps automatically.
      </p>
      {data.playbooks.map((p) => <PlaybookEditor key={p.id} data={data} playbook={p} onChange={onChange} onDelete={() => onChange(removePlaybook(data, p.id))} />)}
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New playbook (e.g. SEO audit)" className={FIELD_CLS} style={FIELD} />
        <Button primary onClick={add} disabled={!name.trim()}>Add playbook</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ templates

function TemplatesTab({ data, onChange }: { data: WorkspacesData; onChange: (next: WorkspacesData) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState('Briefing');
  const [name, setName] = useState('');
  const open = data.templates.find((t) => t.id === openId) ?? null;
  const kinds = useMemo(() => [...new Set(data.templates.map((t) => t.kind))], [data.templates]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3">
        <p className="text-sm flex-1" style={{ color: 'var(--color-text-secondary)' }}>
          Ready-made models for briefings, copy and more. Use one when creating an activity, or duplicate it and make it yours.
        </p>
        <Button primary onClick={() => setCreating(true)}>New template</Button>
      </div>
      {kinds.map((k) => (
        <div key={k} className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase" style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}>{k}</div>
          {data.templates.filter((t) => t.kind === k).map((t) => (
            <button key={t.id} type="button" onClick={() => setOpenId(t.id)} className="text-left rounded-xl px-4 py-3 cursor-pointer flex items-center gap-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
              <Icon name="document-text" size={18} />
              <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{t.name}</span>
              {t.builtIn && <span className="text-xs" style={MUTED}>Built-in</span>}
            </button>
          ))}
        </div>
      ))}

      {creating && (
        <Popup title="New template" onClose={() => setCreating(false)}>
          <div className="flex flex-col gap-3">
            <div><Label>Type</Label><input list="template-kinds" value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD_CLS} style={FIELD} /><datalist id="template-kinds">{kinds.map((k) => <option key={k} value={k} />)}</datalist></div>
            <div><Label>Name</Label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Landing page brief" className={FIELD_CLS} style={FIELD} /></div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button primary disabled={!name.trim()} onClick={() => {
                const next = addTemplate(data, { kind, name, body: '' });
                onChange(next);
                setOpenId(next.templates[next.templates.length - 1].id);
                setName('');
                setCreating(false);
              }}>Create</Button>
            </div>
          </div>
        </Popup>
      )}

      {open && (
        <Popup title={open.name} onClose={() => setOpenId(null)} wide>
          <TemplateEditor key={open.id} template={open} data={data} onChange={onChange} onClose={() => setOpenId(null)} />
        </Popup>
      )}
    </div>
  );
}

function TemplateEditor({ template, data, onChange, onClose }: { template: Template; data: WorkspacesData; onChange: (next: WorkspacesData) => void; onClose: () => void }) {
  const [body, setBody] = useState(template.body);
  const [name, setName] = useState(template.name);
  const locked = template.builtIn;
  return (
    <div className="flex flex-col gap-3">
      <div><Label>Name</Label><input value={name} disabled={locked} onChange={(e) => setName(e.target.value)} className={FIELD_CLS} style={FIELD} /></div>
      <div>
        <Label>Content</Label>
        <textarea value={body} readOnly={locked} onChange={(e) => setBody(e.target.value)} rows={16} className={`${FIELD_CLS} font-mono text-xs`} style={FIELD} />
        {locked && <p className="text-xs mt-1" style={MUTED}>Built-in templates stay as shipped. Duplicate it to edit your own version.</p>}
      </div>
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button onClick={() => { onChange(duplicateTemplate(data, template.id)); onClose(); }}>Duplicate</Button>
          {!locked && <Button onClick={() => { onChange(removeTemplate(data, template.id)); onClose(); }}>Delete</Button>}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { void navigator.clipboard?.writeText(body); }}>Copy</Button>
          {locked
            ? <Button primary onClick={onClose}>Close</Button>
            : <Button primary onClick={() => { onChange(updateTemplate(data, template.id, { name, body })); onClose(); }}>Save</Button>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stages

function StagesTab({ data, onChange }: { data: WorkspacesData; onChange: (next: WorkspacesData) => void }) {
  const [name, setName] = useState('');
  const add = () => {
    onChange(addStage(data, name));
    setName('');
  };
  return (
    <div className="flex flex-col gap-4 max-w-xl mx-auto w-full">
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Stages are global: every workspace and playbook uses the same ones, in this order. They are the columns of the board.
      </p>
      <ul className="flex flex-col gap-1.5">
        {data.stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <span className="text-xs w-5 text-center" style={MUTED}>{i + 1}</span>
            <input defaultValue={s.name} onBlur={(e) => onChange(renameStage(data, s.id, e.target.value))} className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--color-text)' }} aria-label="Stage name" />
            <IconButton name="arrow-up" label="Move up" disabled={i === 0} onClick={() => onChange(moveStage(data, s.id, -1))} />
            <IconButton name="arrow-down" label="Move down" disabled={i === data.stages.length - 1} onClick={() => onChange(moveStage(data, s.id, 1))} />
            <IconButton name="trash-bin-minimalistic" label="Delete stage" disabled={data.stages.length <= 1} onClick={() => onChange(removeStage(data, s.id))} />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New stage" className={FIELD_CLS} style={FIELD} />
        <Button primary onClick={add} disabled={!name.trim()}>Add stage</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page

export function WorkspacesPage() {
  const [data, setData] = useState<WorkspacesData>(loadWorkspaces);
  const [tab, setTab] = useState<Tab>('activities');

  useEffect(() => { saveWorkspaces(data); }, [data]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex justify-center">
          <div className="pings-tab-pill" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id} onClick={() => setTab(t.id)} className="pings-tab-pill-item">
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'activities' && <ActivitiesTab data={data} onChange={setData} />}
        {tab === 'playbooks' && <PlaybooksTab data={data} onChange={setData} />}
        {tab === 'templates' && <TemplatesTab data={data} onChange={setData} />}
        {tab === 'stages' && <StagesTab data={data} onChange={setData} />}
      </div>
    </div>
  );
}
