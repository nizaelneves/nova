import { describe, expect, it } from 'vitest';
import { keptChats } from './chatRetention';

const DAY = 86_400_000;
const now = 100 * DAY;
const chats = { old: { updatedAt: now - 40 * DAY }, mid: { updatedAt: now - 20 * DAY }, fresh: { updatedAt: now - DAY } };

describe('keeping chats', () => {
  it('drops what is older than the chosen days', () => {
    expect(Object.keys(keptChats(chats, 30, null, now))).toEqual(['mid', 'fresh']);
    expect(Object.keys(keptChats(chats, 15, null, now))).toEqual(['fresh']);
  });
  it('keeps everything when forever', () => {
    expect(keptChats(chats, 0, null, now)).toBe(chats);
  });
  it('clears all but the chat that is being answered', () => {
    expect(Object.keys(keptChats(chats, null, 'mid', now))).toEqual(['mid']);
  });
});
