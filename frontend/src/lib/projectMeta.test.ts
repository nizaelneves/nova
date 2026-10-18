import { describe, expect, it } from 'vitest';
import { forget, setLook } from './projectMeta';

describe('project looks', () => {
  it('sets, merges and clears a look, dropping empty entries', () => {
    const a = setLook({}, 'p1', { icon: 'bolt' });
    expect(a).toEqual({ p1: { icon: 'bolt' } });
    const b = setLook(a, 'p1', { archived: true });
    expect(b.p1).toEqual({ icon: 'bolt', archived: true });
    expect(setLook(b, 'p1', { archived: false }).p1).toEqual({ icon: 'bolt' });
    expect(setLook(a, 'p1', { icon: undefined })).toEqual({});
  });

  it('forgets everything about a project and leaves the others', () => {
    const store = setLook(setLook({}, 'p1', { archived: true, image: 'data:x' }), 'p2', { icon: 'gift' });
    expect(forget(store, 'p1')).toEqual({ p2: { icon: 'gift' } });
  });
});
