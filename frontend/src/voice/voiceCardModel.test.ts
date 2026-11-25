import { describe, expect, it } from 'vitest';
import { INITIAL_VOICE_STATE, cardView, fibWindow, formatElapsed, keyParts, matchesShortcut, type VoiceState } from './voiceCardModel';

const state = (over: Partial<VoiceState>): VoiceState => ({ ...INITIAL_VOICE_STATE, ...over });

describe('voice card model', () => {
  it('says the microphone is starting until samples arrive', () => {
    const view = cardView(state({ phase: 'listening', ready: false }));
    expect(view.title).toMatch(/Starting/);
    expect(view.live).toBe(false);
    expect(view.recording).toBe(false);
    expect(view.badge).toBeNull();
  });

  it('shows Listening with the dot, timer, live bars and the wave badge once ready', () => {
    const view = cardView(state({ phase: 'listening', ready: true }));
    expect(view).toMatchObject({ title: 'Listening', recording: true, timer: true, live: true, ring: 'listen', hint: true });
    expect(view.badge?.glyph).toBe('wave');
  });

  it('counts down with the number on the badge and says what will happen', () => {
    const nothing = cardView(state({ phase: 'countdown', countdown_secs: 5, speech_seen: false }), 4.2);
    expect(nothing.title).toBe('Closing in 5…');
    expect(nothing.badge?.label).toBe('5');
    expect(nothing.detail).toMatch(/not said anything/);
    const something = cardView(state({ phase: 'countdown', countdown_secs: 5, speech_seen: true }), 2);
    expect(something.title).toBe('Closing in 2…');
    expect(something.detail).toMatch(/draft/);
    expect(something.live).toBe(true);
  });

  it('never shows a negative countdown', () => {
    expect(cardView(state({ phase: 'countdown', countdown_secs: 5 }), -3).title).toBe('Closing in 0…');
  });

  it('shows Sending with the sending ring, and what was heard when known', () => {
    expect(cardView(state({ phase: 'sending' }))).toMatchObject({ title: 'Sending ...', ring: 'send', detail: null, numbers: true });
    expect(cardView(state({ phase: 'sending', heard: 'Call the client' })).detail).toContain('Call the client');
  });

  it('shows a problem with its badge, sentence and single action', () => {
    const view = cardView(
      state({
        phase: 'error',
        problem: { badge: 'micoff', title: 'No microphone', message: 'Connect one.', action: 'open_mic_settings', action_label: 'Open settings' },
      }),
    );
    expect(view).toMatchObject({ tone: 'error', title: 'No microphone', detail: 'Connect one.' });
    expect(view.badge).toMatchObject({ glyph: 'micoff', color: '#ef4444' });
    expect(view.action).toEqual({ id: 'open_mic_settings', label: 'Open settings' });
  });

  it('a problem without an action offers no button, and a missing model is amber', () => {
    const none = cardView(
      state({ phase: 'error', problem: { badge: 'bang', title: 'Could not understand', message: 'Try again.', action: null, action_label: null } }),
    );
    expect(none.action).toBeNull();
    const model = cardView(
      state({ phase: 'error', problem: { badge: 'download', title: 'Voice model needed', message: 'm', action: 'open_phibe', action_label: 'Open Phibe' } }),
    );
    expect(model.badge?.color).toBe('#f59e0b');
  });

  it('falls back when a problem has no details', () => {
    expect(cardView(state({ phase: 'error' })).detail).toBeTruthy();
  });

  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7400)).toBe('0:07');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('splits a shortcut into keys', () => {
    expect(keyParts('Ctrl+Alt+P')).toEqual(['Ctrl', 'Alt', 'P']);
    expect(keyParts('')).toEqual([]);
  });

  it('matches the shortcut by physical key and exact modifiers', () => {
    const press = { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, code: 'KeyP', key: 'p' };
    expect(matchesShortcut(press, 'Ctrl+Alt+P')).toBe(true);
    expect(matchesShortcut({ ...press, key: 'π' }, 'Ctrl+Alt+P')).toBe(true); // AltGr can change the character
    expect(matchesShortcut({ ...press, shiftKey: true }, 'Ctrl+Alt+P')).toBe(false);
    expect(matchesShortcut({ ...press, altKey: false }, 'Ctrl+Alt+P')).toBe(false);
    expect(matchesShortcut({ ...press, code: 'KeyO', key: 'o' }, 'Ctrl+Alt+P')).toBe(false);
    expect(matchesShortcut({ ...press, ctrlKey: false, altKey: false, code: 'Space', key: ' ' }, 'Space')).toBe(true);
    expect(matchesShortcut(press, '')).toBe(false);
  });
});

describe('fibWindow', () => {
  it('follows the sequence and keeps only the last numbers', () => {
    expect(fibWindow(4, 6)).toEqual([1, 1, 2, 3, 5]);
    expect(fibWindow(8, 4)).toEqual([8, 13, 21, 34]);
  });
});
