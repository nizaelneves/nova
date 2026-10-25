/** How long chats are kept, in days; 0 keeps them forever. */
export const CHAT_RETENTION = [15, 30, 90, 0];

const KEY = 'phibe-chat-retention';

export function getChatRetention(): number {
  try {
    const days = Number(localStorage.getItem(KEY));
    return CHAT_RETENTION.includes(days) ? days : 0;
  } catch {
    return 0;
  }
}

export function setChatRetention(days: number): void {
  try { localStorage.setItem(KEY, String(days)); } catch { /* the choice lasts until the page closes */ }
}

/** The chats left after dropping those not touched for *days* days (all of them when *days* is null), except *keepId*. */
export function keptChats<T extends { updatedAt: number }>(
  chats: Record<string, T>, days: number | null, keepId: string | null, now = Date.now(),
): Record<string, T> {
  if (days === 0) return chats;
  const cutoff = days === null ? Infinity : now - days * 86_400_000;
  return Object.fromEntries(Object.entries(chats).filter(([id, c]) => id === keepId || c.updatedAt >= cutoff));
}
