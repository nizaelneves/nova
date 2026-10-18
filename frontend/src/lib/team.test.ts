import { describe, expect, it } from 'vitest';
import { PROJECT_COLORS } from './projects';
import { addMember, colorFor, initials, removeMember, updateMember } from './team';

describe('team', () => {
  it('adds a member once, ignoring empty or repeated names', () => {
    const one = addMember([], '  Olivia Bennett ', 'Product Manager');
    expect(one[0]).toMatchObject({ name: 'Olivia Bennett', role: 'Product Manager', kind: 'human', current: '' });
    expect(addMember(one, 'olivia bennett', '')).toBe(one);
    expect(addMember(one, '   ', '')).toBe(one);
  });

  it('can add an agent, edit it and remove it', () => {
    const [agent] = addMember([], 'Researcher', 'Deep research', 'agent');
    expect(agent.kind).toBe('agent');
    const edited = updateMember([agent], agent.id, { current: 'Reading papers' });
    expect(edited[0].current).toBe('Reading papers');
    expect(removeMember(edited, agent.id)).toEqual([]);
  });

  it('gives the same colour to the same name, whatever the case', () => {
    expect(colorFor('Sam')).toBe(colorFor('sam'));
    expect(PROJECT_COLORS).toContain(colorFor('Sam'));
  });

  it('takes up to two initials', () => {
    expect(initials('maya  green lee')).toBe('MG');
  });
});
