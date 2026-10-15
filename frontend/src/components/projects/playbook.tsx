import { useState } from 'react';
import { Icon } from '../Icon';
import { Popup } from '../Popup';
import { todayLocal } from '../../lib/tasks-api';
import {
  type Activity,
  type Workspace,
  type Stage,
  type WorkspacesData,
  addActivity,
  addStage,
  addWorkspace,
  currentStageId,
  isOverdue,
  loadWorkspaces,
  moveStage,
  progress,
  removeActivity,
  removeStage,
  removeWorkspace,
  renameStage,
  renameWorkspace,
  saveWorkspaces,
  toggleStep,
  updateActivity,
} from '../../lib/workspaces';

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
  const [start, setStart] = useState(todayLocal());
  const [due, setDue] = useState('');

  return (
    <Popup title="New activity" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div>
          <Label>Workspace</Label>
          <select value={ws} onChange={(e) => setWs(e.target.value)} className={FIELD_CLS} style={FIELD}>
            {data.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Activity</Label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch client X campaign" className={FIELD_CLS} style={FIELD} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start date</Label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={FIELD_CLS} style={FIELD} /></div>
          <div><Label>Due date</Label><input type="date" value={due} min={start} onChange={(e) => setDue(e.target.value)} className={FIELD_CLS} style={FIELD} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!title.trim() || !ws || !start} onClick={() => { onCreate({ workspaceId: ws, title, playbookId: null, start, due, notes: '' }); onClose(); }}>Create</Button>
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
            <Label>Steps</Label>
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

/** One client's activities as a board by stage or a list, with its settings and the shared stages. */
export function Playbook({ data, workspace, onChange, onRename, onDelete }: {
  data: WorkspacesData;
  workspace: Workspace;
  onChange: (next: WorkspacesData) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [view, setView] = useState<'board' | 'list'>('board');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'' | 'settings' | 'stages'>('');
  const today = todayLocal();
  const activities = data.activities
    .filter((a) => a.workspaceId === workspace.id)
    .sort((a, b) => a.due.localeCompare(b.due));
  const open = data.activities.find((a) => a.id === openId) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="pings-tab-pill mr-auto" style={{ padding: '0.2rem' }}>
          {(['board', 'list'] as const).map((v) => (
            <button key={v} type="button" data-active={view === v} onClick={() => setView(v)} className="pings-tab-pill-item" style={{ padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}>
              {v === 'board' ? 'Board' : 'List'}
            </button>
          ))}
        </div>
        <Button onClick={() => setPanel(panel === 'stages' ? '' : 'stages')}>{panel === 'stages' ? 'Close stages' : 'Stages'}</Button>
        <Button onClick={() => setPanel(panel === 'settings' ? '' : 'settings')}>{panel === 'settings' ? 'Close settings' : 'Settings'}</Button>
        <Button primary onClick={() => setCreating(true)}>New activity</Button>
      </div>

      {panel === 'settings' && (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          <div>
            <Label>Name</Label>
            <input defaultValue={workspace.name} key={workspace.id} onBlur={(e) => onRename(e.target.value)} className={FIELD_CLS} style={FIELD} />
          </div>
          <div><Button onClick={onDelete}>Delete project and its activities</Button></div>
        </div>
      )}
      {panel === 'stages' && <StagesTab data={data} onChange={onChange} />}

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
                {items.map((a) => <ActivityCard key={a.id} data={data} activity={a} showWorkspace={false} today={today} onOpen={() => setOpenId(a.id)} />)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activities.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              <div className="flex-1"><ActivityCard data={data} activity={a} showWorkspace={false} today={today} onOpen={() => setOpenId(a.id)} /></div>
              <span className="text-xs w-28" style={MUTED}>{data.stages.find((st) => st.id === currentStageId(a, data.stages))?.name}</span>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <NewActivityPopup data={data} workspaceId={workspace.id} onCreate={(input) => onChange(addActivity(data, input))} onClose={() => setCreating(false)} />
      )}
      {open && <ActivityPopup data={data} activity={open} onChange={onChange} onClose={() => setOpenId(null)} />}
    </section>
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
