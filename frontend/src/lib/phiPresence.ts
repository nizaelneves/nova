import { useSyncExternalStore } from 'react';
import type { BadgeKind } from './phiBubble';

/**
 * Things Phi wants to tell the user, shown as a badge on the floating button and
 * listed in its chat bubble. Anything in the app can call `notifyPhi`; approvals
 * come from the server and are handled by the bubble itself.
 */

export interface PhiEvent {
  id: string;
  kind: Exclude<BadgeKind, 'approval'>;
  text: string;
  at: number;
}

let events: PhiEvent[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit(next: PhiEvent[]) {
  events = next;
  listeners.forEach((l) => l());
}

export function notifyPhi(kind: PhiEvent['kind'], text: string): string {
  const trimmed = text.trim();
  const id = `phi-${Date.now().toString(36)}-${counter++}`;
  if (!trimmed) return id;
  emit([{ id, kind, text: trimmed, at: Date.now() }, ...events].slice(0, 20));
  return id;
}

export function dismissPhiEvent(id: string): void {
  emit(events.filter((e) => e.id !== id));
}

export function clearPhiEvents(): void {
  emit([]);
}

export function getPhiEvents(): readonly PhiEvent[] {
  return events;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePhiEvents(): readonly PhiEvent[] {
  return useSyncExternalStore(subscribe, getPhiEvents, getPhiEvents);
}
