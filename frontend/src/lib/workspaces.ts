/**
 * Workspaces: one per client, each with its own activities. Stages, playbooks
 * and templates are global, shared by every workspace. A playbook is a service
 * flow (a list of steps with a duration each); applying it to an activity
 * schedules the steps one after another from the start date.
 * Kept in this browser, like the other client-side data.
 */

export interface Stage {
  id: string;
  name: string;
}

export interface PlaybookStep {
  id: string;
  title: string;
  stageId: string;
  days: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  steps: PlaybookStep[];
}

export interface Template {
  id: string;
  kind: string;
  name: string;
  body: string;
  builtIn: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  /** Playbooks (services) this client contracted. Empty means all of them. */
  playbookIds: string[];
  /** What the team knows about the client, by ABOUT_FIELDS key. */
  about: Record<string, string>;
}

export const ABOUT_FIELDS = ['Company', 'Mission', 'Vision', 'Goals', 'Audience', 'What worked', 'Stakeholders'] as const;

export interface ActivityStep {
  id: string;
  title: string;
  stageId: string;
  start: string; // YYYY-MM-DD
  due: string; // YYYY-MM-DD
  done: boolean;
}

export interface Activity {
  id: string;
  workspaceId: string;
  title: string;
  playbookId: string | null;
  stageId: string;
  start: string;
  due: string;
  steps: ActivityStep[];
  notes: string;
}

export interface WorkspacesData {
  stages: Stage[];
  playbooks: Playbook[];
  templates: Template[];
  workspaces: Workspace[];
  activities: Activity[];
}

const STORAGE_KEY = 'phibe-workspaces';

export const DEFAULT_STAGES: Stage[] = [
  { id: 'stage-briefing', name: 'Briefing' },
  { id: 'stage-copy', name: 'Copywriting' },
  { id: 'stage-design', name: 'Design' },
  { id: 'stage-review', name: 'Review' },
  { id: 'stage-done', name: 'Published' },
];

const step = (id: string, title: string, stageId: string, days: number): PlaybookStep => ({ id, title, stageId, days });

export const DEFAULT_PLAYBOOKS: Playbook[] = [
  {
    id: 'pb-paid-traffic',
    name: 'Paid traffic',
    description: 'Launch a campaign from briefing to live ads.',
    steps: [
      step('pt-1', 'Creative briefing', 'stage-briefing', 1),
      step('pt-2', 'Wait for the client material', 'stage-briefing', 2),
      step('pt-3', 'Write the ad copy', 'stage-copy', 1),
      step('pt-4', 'Produce the creatives', 'stage-design', 2),
      step('pt-5', 'Client approval', 'stage-review', 1),
      step('pt-6', 'Upload the campaign', 'stage-done', 1),
    ],
  },
  {
    id: 'pb-social',
    name: 'Social media post',
    description: 'From idea to published post.',
    steps: [
      step('sm-1', 'Brief the post', 'stage-briefing', 1),
      step('sm-2', 'Write the caption', 'stage-copy', 1),
      step('sm-3', 'Design the art', 'stage-design', 2),
      step('sm-4', 'Review and approval', 'stage-review', 1),
      step('sm-5', 'Publish', 'stage-done', 1),
    ],
  },
];

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'tpl-briefing',
    kind: 'Briefing',
    name: 'Killer briefing',
    builtIn: true,
    body: `# Briefing

**Client / brand:**
**Project:**
**Deadline:**

## 1. Goal
What must change when this works? One measurable result (e.g. 120 leads at up to $8 each).

## 2. Audience
Who are we talking to? Age, role, pains, desires, where they spend time.

## 3. Message
The one thing they must remember. Why should they believe it? (proof, numbers, testimonials)

## 4. Offer and call to action
What are we offering and what should they do next?

## 5. Channels and formats
Where it will run and in which formats and sizes.

## 6. References
Examples we like (and ones we do not), competitors, brand guide.

## 7. Constraints
Budget, legal notes, words to avoid, mandatory elements.

## 8. Approval
Who approves, and by when?`,
  },
  {
    id: 'tpl-copy',
    kind: 'Copy',
    name: 'Ad copy (PAS)',
    builtIn: true,
    body: `# Ad copy: Problem, Agitate, Solve

**Headline (the hook):**

**Problem:** name the pain in the customer's own words.

**Agitate:** what happens if nothing changes?

**Solve:** how the offer fixes it, with one proof point.

**Call to action:**

## Variations
- Headline B:
- Headline C:`,
  },
  {
    id: 'tpl-creative',
    kind: 'Creative',
    name: 'Creative request',
    builtIn: true,
    body: `# Creative request

**Format and size:**
**Main message (max 8 words):**
**Visual direction:**
**Mandatory elements (logo, price, legal):**
**Reference links:**
**Deadline:**`,
  },
  {
    id: 'tpl-report',
    kind: 'Report',
    name: 'Monthly report',
    builtIn: true,
    body: `# Monthly report

## Results
Compare against the goal: spend, leads or sales, cost per result.

## What worked
## What did not
## Next month
Three priorities and the tests we will run.`,
  },
];

export const EMPTY_WORKSPACES: WorkspacesData = {
  stages: DEFAULT_STAGES,
  playbooks: DEFAULT_PLAYBOOKS,
  templates: DEFAULT_TEMPLATES,
  workspaces: [],
  activities: [],
};

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------- dates

const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// ---------------------------------------------------------------- persistence

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Reads stored data, dropping anything malformed instead of failing. */
export function parseWorkspaces(raw: string | null): WorkspacesData {
  if (!raw) return structuredClone(EMPTY_WORKSPACES);
  try {
    const d = JSON.parse(raw) as Partial<WorkspacesData>;
    const stages = Array.isArray(d.stages) ? d.stages.filter((s) => s && isStr(s.id) && isStr(s.name)) : [];
    if (stages.length === 0) return structuredClone(EMPTY_WORKSPACES);
    const stageIds = new Set(stages.map((s) => s.id));
    const playbooks = (Array.isArray(d.playbooks) ? d.playbooks : [])
      .filter((p) => p && isStr(p.id) && isStr(p.name) && Array.isArray(p.steps))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: isStr(p.description) ? p.description : '',
        steps: p.steps
          .filter((s) => s && isStr(s.id) && isStr(s.title))
          .map((s) => ({
            id: s.id,
            title: s.title,
            stageId: stageIds.has(s.stageId) ? s.stageId : stages[0].id,
            days: Number.isFinite(s.days) && s.days > 0 ? Math.round(s.days) : 1,
          })),
      }));
    const templates = (Array.isArray(d.templates) ? d.templates : [])
      .filter((t) => t && isStr(t.id) && isStr(t.name) && isStr(t.body))
      .map((t) => ({ id: t.id, kind: isStr(t.kind) ? t.kind : 'Other', name: t.name, body: t.body, builtIn: !!t.builtIn }));
    const workspaces = (Array.isArray(d.workspaces) ? d.workspaces : [])
      .filter((w) => w && isStr(w.id) && isStr(w.name))
      .map((w) => ({
        id: w.id,
        name: w.name,
        playbookIds: Array.isArray(w.playbookIds) ? w.playbookIds.filter(isStr) : [],
        about: Object.fromEntries(Object.entries(w.about ?? {}).filter(([, v]) => isStr(v))),
      }));
    const workspaceIds = new Set(workspaces.map((w) => w.id));
    const activities = (Array.isArray(d.activities) ? d.activities : [])
      .filter((a) => a && isStr(a.id) && isStr(a.title) && workspaceIds.has(a.workspaceId) && isDate(a.start) && isDate(a.due))
      .map((a) => ({
        id: a.id,
        workspaceId: a.workspaceId,
        title: a.title,
        playbookId: isStr(a.playbookId) ? a.playbookId : null,
        stageId: stageIds.has(a.stageId) ? a.stageId : stages[0].id,
        start: a.start,
        due: a.due,
        notes: isStr(a.notes) ? a.notes : '',
        steps: (Array.isArray(a.steps) ? a.steps : [])
          .filter((s) => s && isStr(s.id) && isStr(s.title) && isDate(s.start) && isDate(s.due))
          .map((s) => ({
            id: s.id,
            title: s.title,
            stageId: stageIds.has(s.stageId) ? s.stageId : stages[0].id,
            start: s.start,
            due: s.due,
            done: !!s.done,
          })),
      }));
    return { stages, playbooks, templates, workspaces, activities };
  } catch {
    return structuredClone(EMPTY_WORKSPACES);
  }
}

export function loadWorkspaces(): WorkspacesData {
  try {
    return parseWorkspaces(localStorage.getItem(STORAGE_KEY));
  } catch {
    return structuredClone(EMPTY_WORKSPACES);
  }
}

export function saveWorkspaces(data: WorkspacesData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked or full: the data just lasts until the page closes.
  }
}

// ---------------------------------------------------------------- scheduling

/** Lays playbook steps one after another from `start`, each lasting its days. */
export function scheduleSteps(playbook: Playbook, start: string): ActivityStep[] {
  let cursor = start;
  return playbook.steps.map((s) => {
    const begin = cursor;
    const end = addDays(begin, Math.max(1, s.days) - 1);
    cursor = addDays(end, 1);
    return { id: uid('as'), title: s.title, stageId: s.stageId, start: begin, due: end, done: false };
  });
}

/** The stage an activity is in: that of its first open step, or the last stage once every step is done. */
export function currentStageId(activity: Activity, stages: Stage[]): string {
  if (activity.steps.length === 0) return activity.stageId;
  const open = activity.steps.find((s) => !s.done);
  return open ? open.stageId : stages[stages.length - 1].id;
}

export function progress(activity: Activity): { done: number; total: number } {
  return { done: activity.steps.filter((s) => s.done).length, total: activity.steps.length };
}

export function isOverdue(activity: Activity, stages: Stage[], today: string): boolean {
  const finished = progress(activity).total > 0
    ? progress(activity).done === progress(activity).total
    : activity.stageId === stages[stages.length - 1].id;
  return !finished && activity.due < today;
}

// ---------------------------------------------------------------- changes

export function addWorkspace(data: WorkspacesData, name: string): WorkspacesData {
  const trimmed = name.trim();
  if (!trimmed) return data;
  return { ...data, workspaces: [...data.workspaces, { id: uid('ws'), name: trimmed, playbookIds: [], about: {} }] };
}

export function renameWorkspace(data: WorkspacesData, id: string, name: string): WorkspacesData {
  const trimmed = name.trim();
  if (!trimmed) return data;
  return { ...data, workspaces: data.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)) };
}

export function setAbout(data: WorkspacesData, id: string, field: string, value: string): WorkspacesData {
  return { ...data, workspaces: data.workspaces.map((w) => (w.id === id ? { ...w, about: { ...w.about, [field]: value } } : w)) };
}

export function removeWorkspace(data: WorkspacesData, id: string): WorkspacesData {
  return {
    ...data,
    workspaces: data.workspaces.filter((w) => w.id !== id),
    activities: data.activities.filter((a) => a.workspaceId !== id),
  };
}

export function toggleWorkspacePlaybook(data: WorkspacesData, workspaceId: string, playbookId: string): WorkspacesData {
  return {
    ...data,
    workspaces: data.workspaces.map((w) => {
      if (w.id !== workspaceId) return w;
      const has = w.playbookIds.includes(playbookId);
      return { ...w, playbookIds: has ? w.playbookIds.filter((p) => p !== playbookId) : [...w.playbookIds, playbookId] };
    }),
  };
}

export interface NewActivity {
  workspaceId: string;
  title: string;
  playbookId: string | null;
  start: string;
  due: string;
  notes?: string;
}

/**
 * Adds an activity. With a playbook, its steps are scheduled from the start date;
 * an empty or earlier due date then becomes the end of the last step.
 */
export function addActivity(data: WorkspacesData, input: NewActivity): WorkspacesData {
  const title = input.title.trim();
  if (!title || !isDate(input.start) || !data.workspaces.some((w) => w.id === input.workspaceId)) return data;
  const playbook = data.playbooks.find((p) => p.id === input.playbookId) ?? null;
  const steps = playbook ? scheduleSteps(playbook, input.start) : [];
  const lastStep = steps.length ? steps[steps.length - 1].due : input.start;
  const due = isDate(input.due) && input.due >= input.start ? input.due : lastStep;
  const activity: Activity = {
    id: uid('act'),
    workspaceId: input.workspaceId,
    title,
    playbookId: playbook ? playbook.id : null,
    stageId: steps.length ? steps[0].stageId : data.stages[0].id,
    start: input.start,
    due,
    steps,
    notes: (input.notes ?? '').trim(),
  };
  return { ...data, activities: [activity, ...data.activities] };
}

export function updateActivity(data: WorkspacesData, id: string, patch: Partial<Pick<Activity, 'title' | 'start' | 'due' | 'notes' | 'stageId'>>): WorkspacesData {
  return {
    ...data,
    activities: data.activities.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a, ...patch };
      if (patch.title !== undefined && !patch.title.trim()) next.title = a.title;
      if (!isDate(next.start)) next.start = a.start;
      if (!isDate(next.due) || next.due < next.start) next.due = a.due >= next.start ? a.due : next.start;
      return next;
    }),
  };
}

export function toggleStep(data: WorkspacesData, activityId: string, stepId: string): WorkspacesData {
  return {
    ...data,
    activities: data.activities.map((a) => {
      if (a.id !== activityId) return a;
      const steps = a.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
      const next = { ...a, steps };
      return { ...next, stageId: currentStageId(next, data.stages) };
    }),
  };
}

export function removeActivity(data: WorkspacesData, id: string): WorkspacesData {
  return { ...data, activities: data.activities.filter((a) => a.id !== id) };
}

// stages (global)

export function addStage(data: WorkspacesData, name: string): WorkspacesData {
  const trimmed = name.trim();
  if (!trimmed) return data;
  return { ...data, stages: [...data.stages, { id: uid('stage'), name: trimmed }] };
}

export function renameStage(data: WorkspacesData, id: string, name: string): WorkspacesData {
  const trimmed = name.trim();
  if (!trimmed) return data;
  return { ...data, stages: data.stages.map((s) => (s.id === id ? { ...s, name: trimmed } : s)) };
}

export function moveStage(data: WorkspacesData, id: string, dir: -1 | 1): WorkspacesData {
  const i = data.stages.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= data.stages.length) return data;
  const stages = [...data.stages];
  [stages[i], stages[j]] = [stages[j], stages[i]];
  return { ...data, stages };
}

/** Removes a stage; its steps and activities move to the first remaining stage. At least one stage always stays. */
export function removeStage(data: WorkspacesData, id: string): WorkspacesData {
  if (data.stages.length <= 1) return data;
  const stages = data.stages.filter((s) => s.id !== id);
  const fallback = stages[0].id;
  const swap = (stageId: string) => (stageId === id ? fallback : stageId);
  return {
    ...data,
    stages,
    playbooks: data.playbooks.map((p) => ({ ...p, steps: p.steps.map((s) => ({ ...s, stageId: swap(s.stageId) })) })),
    activities: data.activities.map((a) => ({
      ...a,
      stageId: swap(a.stageId),
      steps: a.steps.map((s) => ({ ...s, stageId: swap(s.stageId) })),
    })),
  };
}

// playbooks (global)

export function addPlaybook(data: WorkspacesData, name: string): WorkspacesData {
  const trimmed = name.trim();
  if (!trimmed) return data;
  return { ...data, playbooks: [...data.playbooks, { id: uid('pb'), name: trimmed, description: '', steps: [] }] };
}

export function updatePlaybook(data: WorkspacesData, id: string, patch: Partial<Pick<Playbook, 'name' | 'description'>>): WorkspacesData {
  return {
    ...data,
    playbooks: data.playbooks.map((p) => {
      if (p.id !== id) return p;
      const name = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : p.name;
      return { ...p, ...patch, name };
    }),
  };
}

export function removePlaybook(data: WorkspacesData, id: string): WorkspacesData {
  return {
    ...data,
    playbooks: data.playbooks.filter((p) => p.id !== id),
    workspaces: data.workspaces.map((w) => ({ ...w, playbookIds: w.playbookIds.filter((p) => p !== id) })),
  };
}

export function addPlaybookStep(data: WorkspacesData, playbookId: string, title: string, stageId: string, days: number): WorkspacesData {
  const trimmed = title.trim();
  if (!trimmed) return data;
  const stage = data.stages.some((s) => s.id === stageId) ? stageId : data.stages[0].id;
  const created: PlaybookStep = { id: uid('ps'), title: trimmed, stageId: stage, days: Number.isFinite(days) && days > 0 ? Math.round(days) : 1 };
  return { ...data, playbooks: data.playbooks.map((p) => (p.id === playbookId ? { ...p, steps: [...p.steps, created] } : p)) };
}

export function updatePlaybookStep(
  data: WorkspacesData,
  playbookId: string,
  stepId: string,
  patch: Partial<Pick<PlaybookStep, 'title' | 'stageId' | 'days'>>,
): WorkspacesData {
  return {
    ...data,
    playbooks: data.playbooks.map((p) =>
      p.id !== playbookId
        ? p
        : {
            ...p,
            steps: p.steps.map((s) => {
              if (s.id !== stepId) return s;
              const next = { ...s, ...patch };
              if (!next.title.trim()) next.title = s.title;
              if (!Number.isFinite(next.days) || next.days < 1) next.days = s.days;
              next.days = Math.round(next.days);
              return next;
            }),
          },
    ),
  };
}

export function movePlaybookStep(data: WorkspacesData, playbookId: string, stepId: string, dir: -1 | 1): WorkspacesData {
  return {
    ...data,
    playbooks: data.playbooks.map((p) => {
      if (p.id !== playbookId) return p;
      const i = p.steps.findIndex((s) => s.id === stepId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.steps.length) return p;
      const steps = [...p.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...p, steps };
    }),
  };
}

export function removePlaybookStep(data: WorkspacesData, playbookId: string, stepId: string): WorkspacesData {
  return {
    ...data,
    playbooks: data.playbooks.map((p) => (p.id === playbookId ? { ...p, steps: p.steps.filter((s) => s.id !== stepId) } : p)),
  };
}

export function playbookDays(playbook: Playbook): number {
  return playbook.steps.reduce((sum, s) => sum + s.days, 0);
}

// templates

export function addTemplate(data: WorkspacesData, input: { kind: string; name: string; body: string }): WorkspacesData {
  const name = input.name.trim();
  if (!name) return data;
  const created: Template = { id: uid('tpl'), kind: input.kind.trim() || 'Other', name, body: input.body, builtIn: false };
  return { ...data, templates: [...data.templates, created] };
}

export function updateTemplate(data: WorkspacesData, id: string, patch: Partial<Pick<Template, 'kind' | 'name' | 'body'>>): WorkspacesData {
  return {
    ...data,
    templates: data.templates.map((t) => {
      if (t.id !== id) return t;
      const name = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : t.name;
      return { ...t, ...patch, name };
    }),
  };
}

export function removeTemplate(data: WorkspacesData, id: string): WorkspacesData {
  return { ...data, templates: data.templates.filter((t) => t.id !== id) };
}

/** A copy the user can edit freely; the original stays as shipped. */
export function duplicateTemplate(data: WorkspacesData, id: string): WorkspacesData {
  const source = data.templates.find((t) => t.id === id);
  if (!source) return data;
  return { ...data, templates: [...data.templates, { ...source, id: uid('tpl'), name: `${source.name} (copy)`, builtIn: false }] };
}
