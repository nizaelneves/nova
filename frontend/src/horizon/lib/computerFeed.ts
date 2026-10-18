import { create } from 'zustand';
import { apiFetch } from '../../lib/api';
import { push } from './computer';

export interface Report {
  os: string;
  cpu: { name: string; usage: number; cores: number; threads: number; mhz: number | null; each: number[] };
  memory: { used: number; total: number; swap_used: number; swap_total: number };
  gpus: { name: string; usage: number; memory_used: number; memory_total: number; temperature: number }[];
  disks: { name: string; used: number; total: number }[];
  network: { down: number; up: number };
  battery: { percent: number; charging: boolean; seconds_left: number | null } | null;
  programs: { by_cpu: Program[]; by_memory: Program[] };
  ollama: { running: boolean; version?: string; installed?: number };
  phibe: { memory: number };
}
export interface Program { name: string; cpu: number; memory: number }

interface Feed { report: Report | null; failed: boolean; cpuHistory: number[]; downHistory: number[] }

/** The latest reading of this computer, kept even while nothing shows it, so the widget opens already full. */
export const useComputer = create<Feed>(() => ({ report: null, failed: false, cpuHistory: [], downHistory: [] }));

export const WATCHED_MS = 2000; // a screen shows it: live
export const BACKGROUND_MS = 15000; // nobody looks: just keep it fresh

let timer: ReturnType<typeof setInterval> | undefined;
let watchers = 0;
let started = false;

async function poll(): Promise<void> {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const report = (await (await apiFetch('/v1/widgets/computer')).json()) as Report;
    useComputer.setState((s) => ({ report, failed: false, cpuHistory: push(s.cpuHistory, report.cpu.usage), downHistory: push(s.downHistory, report.network.down) }));
  } catch {
    useComputer.setState({ failed: true });
  }
}

function schedule(): void {
  clearInterval(timer);
  timer = setInterval(() => void poll(), watchers > 0 ? WATCHED_MS : BACKGROUND_MS);
}

/** Starts reading this computer for the whole app (once). */
export function startComputerFeed(): void {
  if (started) return;
  started = true;
  void poll();
  schedule();
}

/** A screen that shows the reading calls this; the feed runs at full speed until the returned function is called. */
export function watchComputer(): () => void {
  watchers += 1;
  schedule();
  void poll();
  return () => { watchers -= 1; schedule(); };
}

/** For tests: forget everything. */
export function resetComputerFeed(): void {
  clearInterval(timer);
  timer = undefined; watchers = 0; started = false;
  useComputer.setState({ report: null, failed: false, cpuHistory: [], downHistory: [] });
}
