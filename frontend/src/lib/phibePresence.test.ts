import { beforeEach, describe, expect, it } from 'vitest';
import { clearPhibeEvents, dismissPhibeEvent, dismissPhibeEventsOfKind, getPhibeEvents, notifyPhibe } from './phibePresence';

describe('phibePresence', () => {
  beforeEach(() => clearPhibeEvents());

  it('keeps the newest first and ignores blank text', () => {
    notifyPhibe('done', 'First');
    notifyPhibe('ping', 'Second');
    notifyPhibe('ping', '   ');
    expect(getPhibeEvents().map((e) => e.text)).toEqual(['Second', 'First']);
  });

  it('dismisses one event by id', () => {
    const a = notifyPhibe('done', 'A');
    notifyPhibe('question', 'B');
    dismissPhibeEvent(a);
    expect(getPhibeEvents().map((e) => e.text)).toEqual(['B']);
  });

  it('dismisses all the notices of one kind', () => {
    notifyPhibe('draft', 'one');
    notifyPhibe('done', 'two');
    notifyPhibe('draft', 'three');
    dismissPhibeEventsOfKind('draft');
    expect(getPhibeEvents().map((e) => e.text)).toEqual(['two']);
  });

  it('never keeps more than 20', () => {
    for (let i = 0; i < 30; i++) notifyPhibe('ping', `n${i}`);
    expect(getPhibeEvents()).toHaveLength(20);
  });
});
