import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORKSPACES,
  addActivity,
  addDays,
  addPlaybookStep,
  addWorkspace,
  currentStageId,
  isOverdue,
  moveStage,
  parseWorkspaces,
  removeStage,
  removeWorkspace,
  toggleStep,
  updateActivity,
  type WorkspacesData,
} from './workspaces';

function withClient(): { data: WorkspacesData; id: string } {
  const data = addWorkspace(structuredClone(EMPTY_WORKSPACES), 'Client X');
  return { data, id: data.workspaces[0].id };
}

describe('workspaces', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-10-03', 3)).toBe('2026-10-06');
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('schedules a playbook one step after another from the start date', () => {
    const { data, id } = withClient();
    const next = addActivity(data, { workspaceId: id, title: 'Launch campaign', playbookId: 'pb-paid-traffic', start: '2026-10-03', due: '' });
    const a = next.activities[0];
    expect(a.steps[0]).toMatchObject({ start: '2026-10-03', due: '2026-10-03' });
    expect(a.steps[1]).toMatchObject({ start: '2026-10-04', due: '2026-10-05' });
    expect(a.due).toBe(a.steps[a.steps.length - 1].due);
  });

  it('keeps a due date the user chose', () => {
    const { data, id } = withClient();
    const next = addActivity(data, { workspaceId: id, title: 'Launch', playbookId: null, start: '2026-10-03', due: '2026-10-06' });
    expect(next.activities[0].due).toBe('2026-10-06');
    expect(next.activities[0].steps).toEqual([]);
  });

  it('ignores a blank title or an unknown workspace', () => {
    const { data, id } = withClient();
    expect(addActivity(data, { workspaceId: id, title: '  ', playbookId: null, start: '2026-10-03', due: '' })).toBe(data);
    expect(addActivity(data, { workspaceId: 'nope', title: 'x', playbookId: null, start: '2026-10-03', due: '' })).toBe(data);
  });

  it('moves the activity through the stages as steps are done', () => {
    const { data, id } = withClient();
    let d = addActivity(data, { workspaceId: id, title: 'Post', playbookId: 'pb-social', start: '2026-10-03', due: '' });
    const act = d.activities[0];
    expect(act.stageId).toBe('stage-briefing');
    d = toggleStep(d, act.id, act.steps[0].id);
    expect(d.activities[0].stageId).toBe('stage-copy');
    for (const s of act.steps.slice(1)) d = toggleStep(d, act.id, s.id);
    expect(currentStageId(d.activities[0], d.stages)).toBe('stage-done');
  });

  it('flags only unfinished activities past their due date', () => {
    const { data, id } = withClient();
    const d = addActivity(data, { workspaceId: id, title: 'Late', playbookId: null, start: '2026-10-01', due: '2026-10-02' });
    expect(isOverdue(d.activities[0], d.stages, '2026-10-03')).toBe(true);
    expect(isOverdue(d.activities[0], d.stages, '2026-10-02')).toBe(false);
  });

  it('rejects an end date before the start', () => {
    const { data, id } = withClient();
    const d = addActivity(data, { workspaceId: id, title: 'A', playbookId: null, start: '2026-10-03', due: '2026-10-06' });
    const next = updateActivity(d, d.activities[0].id, { due: '2026-10-01' });
    expect(next.activities[0].due).toBe('2026-10-06');
  });

  it('removing a stage moves its steps to the first one and keeps at least one', () => {
    const d = removeStage(structuredClone(EMPTY_WORKSPACES), 'stage-design');
    expect(d.stages.some((s) => s.id === 'stage-design')).toBe(false);
    const step = d.playbooks[0].steps.find((s) => s.id === 'pt-4');
    expect(step?.stageId).toBe(d.stages[0].id);
    let one = structuredClone(EMPTY_WORKSPACES);
    for (const s of [...one.stages]) one = removeStage(one, s.id);
    expect(one.stages).toHaveLength(1);
  });

  it('reorders stages', () => {
    const d = moveStage(structuredClone(EMPTY_WORKSPACES), 'stage-copy', -1);
    expect(d.stages[0].id).toBe('stage-copy');
    expect(moveStage(d, 'stage-copy', -1)).toBe(d);
  });

  it('deleting a workspace deletes its activities', () => {
    const { data, id } = withClient();
    const d = addActivity(data, { workspaceId: id, title: 'A', playbookId: null, start: '2026-10-03', due: '' });
    expect(removeWorkspace(d, id).activities).toEqual([]);
  });

  it('adds a playbook step with sane defaults', () => {
    const d = addPlaybookStep(structuredClone(EMPTY_WORKSPACES), 'pb-social', 'Extra', 'unknown-stage', 0);
    const last = d.playbooks[1].steps[d.playbooks[1].steps.length - 1];
    expect(last).toMatchObject({ title: 'Extra', days: 1, stageId: 'stage-briefing' });
  });

  it('survives corrupt storage', () => {
    expect(parseWorkspaces('{oops').stages.length).toBeGreaterThan(0);
    expect(parseWorkspaces(null).playbooks.length).toBeGreaterThan(0);
    const d = parseWorkspaces(JSON.stringify({ stages: [{ id: 's', name: 'S' }], activities: [{ id: 'a', title: 'x', workspaceId: 'gone' }] }));
    expect(d.activities).toEqual([]);
  });
});
