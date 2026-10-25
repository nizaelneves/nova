import { useSyncExternalStore } from 'react';
import type { BadgeKind } from './phibeBubble';

/**
 * Things Phibe wants to tell the user, shown as a badge on the floating button and
 * listed in its chat bubble. Anything in the app can call `notifyPhibe`; approvals
 * come from the server and are handled by the bubble itself.
 */

interface PhibeEvent {
  id: string;
  kind: Exclude<BadgeKind, 'approval'>;
  text: string;
  at: number;
}

let events: PhibeEvent[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit(next: PhibeEvent[]) {
  events = next;
  listeners.forEach((l) => l());
}

export function notifyPhibe(kind: PhibeEvent['kind'], text: string): string {
  const trimmed = text.trim();
  const id = `phibe-${Date.now().toString(36)}-${counter++}`;
  if (!trimmed) return id;
  emit([{ id, kind, text: trimmed, at: Date.now() }, ...events].slice(0, 20));
  return id;
}

export function dismissPhibeEvent(id: string): void {
  emit(events.filter((e) => e.id !== id));
}

/** Removes every notice of one kind (e.g. the voice-draft notice once the draft is taken). */
export function dismissPhibeEventsOfKind(kind: PhibeEvent['kind']): void {
  emit(events.filter((e) => e.kind !== kind));
}

export function clearPhibeEvents(): void {
  emit([]);
}

export function getPhibeEvents(): readonly PhibeEvent[] {
  return events;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePhibeEvents(): readonly PhibeEvent[] {
  return useSyncExternalStore(subscribe, getPhibeEvents, getPhibeEvents);
}
