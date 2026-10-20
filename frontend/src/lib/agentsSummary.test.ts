import { describe, expect, it } from 'vitest';
import { summarizeAgents } from './agentsSummary';

const a = (status: string) => ({ status });

describe('agents summary', () => {
  it('says what to do when there are none, or when the manager is off', () => {
    expect(summarizeAgents([], true)).toBe('No agents yet. Launch one to get started.');
    expect(summarizeAgents([], false)).toContain('manager is off');
  });

  it('counts running and paused agents and flags the ones in trouble', () => {
    expect(summarizeAgents([a('running'), a('paused'), a('idle')], true)).toBe('3 agents, 1 running and 1 paused.');
    expect(summarizeAgents([a('error'), a('stalled')], true)).toBe('2 agents, 0 running and 0 paused. 2 need attention.');
    expect(summarizeAgents([a('idle')], true)).toBe('1 agent, 0 running and 0 paused.');
  });
});
