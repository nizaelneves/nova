import { describe, expect, it } from 'vitest';
import { shortcutFromEvent } from './shortcutKeys';

const press = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) =>
  shortcutFromEvent({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe('shortcutFromEvent', () => {
  it('builds the text the app registers', () => {
    expect(press('KeyP', { ctrlKey: true, altKey: true })).toBe('Ctrl+Alt+P');
    expect(press('Digit1', { ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+1');
    expect(press('F9', { altKey: true })).toBe('Alt+F9');
    expect(press('Space', { ctrlKey: true })).toBe('Ctrl+Space');
  });

  it('waits while only modifiers are held', () => {
    expect(press('ControlLeft', { ctrlKey: true })).toBeNull();
    expect(press('AltRight', { altKey: true })).toBeNull();
  });

  it('refuses a bare key, which would break typing everywhere', () => {
    expect(press('KeyP')).toBeNull();
    expect(press('F9')).toBeNull();
  });

  it('refuses keys the app cannot register', () => {
    expect(press('Backquote', { ctrlKey: true })).toBeNull();
  });
});
