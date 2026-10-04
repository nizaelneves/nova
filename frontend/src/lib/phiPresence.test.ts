import { beforeEach, describe, expect, it } from 'vitest';
import { clearPhiEvents, dismissPhiEvent, getPhiEvents, notifyPhi } from './phiPresence';

describe('phiPresence', () => {
  beforeEach(() => clearPhiEvents());

  it('keeps the newest first and ignores blank text', () => {
    notifyPhi('done', 'First');
    notifyPhi('ping', 'Second');
    notifyPhi('ping', '   ');
    expect(getPhiEvents().map((e) => e.text)).toEqual(['Second', 'First']);
  });

  it('dismisses one event by id', () => {
    const a = notifyPhi('done', 'A');
    notifyPhi('question', 'B');
    dismissPhiEvent(a);
    expect(getPhiEvents().map((e) => e.text)).toEqual(['B']);
  });

  it('never keeps more than 20', () => {
    for (let i = 0; i < 30; i++) notifyPhi('ping', `n${i}`);
    expect(getPhiEvents()).toHaveLength(20);
  });
});
