import type { SyncSettings } from './api';

/** How often a source updates, in minutes: 0 is only when Phibe starts, 1440 is once a day at a set time. */
const SYNC_CHOICES = [0, 1440, 60, 180, 360, 720];

const ON_START = 0;
export const DAILY = 1440;

export function choiceLabel(minutes: number): string {
  if (minutes === ON_START) return 'Only When Phibe Starts';
  if (minutes === DAILY) return 'Once A Day At';
  if (minutes === 60) return 'Every Hour';
  if (minutes % 60 === 0 && minutes < DAILY) return `Every ${minutes / 60} Hours`;
  return `Every ${minutes} Minutes`;
}

type Chosen = Pick<SyncSettings, 'interval_minutes' | 'daily_time' | 'disabled_connectors' | 'intervals' | 'daily_times'>;

/** A rhythm set in the file by hand still shows up in the list. */
export const choicesWith = (current: number): number[] =>
  SYNC_CHOICES.includes(current) ? SYNC_CHOICES : [...SYNC_CHOICES, current];

/** The rhythm a source has now: its own, or the general one. */
export const minutesOf = (s: Chosen, source: string): number => s.intervals?.[source] ?? s.interval_minutes;

/** The time of day a once-a-day source runs at. */
export const timeOf = (s: Chosen, source: string): string => s.daily_times?.[source] ?? s.daily_time;

/** The fields to save so that *source* gets *minutes*, leaving every other source as it is. */
export function withChoice(s: Chosen, source: string, minutes: number): Pick<SyncSettings, 'intervals' | 'disabled_connectors' | 'daily_times'> {
  return {
    intervals: { ...(s.intervals ?? {}), [source]: minutes },
    disabled_connectors: s.disabled_connectors.filter((id) => id !== source),
    daily_times: { ...(s.daily_times ?? {}), [source]: timeOf(s, source) },
  };
}

/** The fields to save so that *source* runs at *time* when it updates once a day. */
export const withTime = (s: Chosen, source: string, time: string): Pick<SyncSettings, 'daily_times'> => ({
  daily_times: { ...(s.daily_times ?? {}), [source]: time },
});

/** A source with no rhythm of its own follows the general one. */
export const hasOwn = (s: Chosen, source: string): boolean => s.intervals?.[source] !== undefined;

/** The fields to save so that *source* follows the general rhythm again. */
export function withDefault(s: Chosen, source: string): Pick<SyncSettings, 'intervals' | 'daily_times'> {
  const { [source]: _i, ...intervals } = s.intervals ?? {};
  const { [source]: _t, ...daily_times } = s.daily_times ?? {};
  return { intervals, daily_times };
}
