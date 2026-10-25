"""Keep connected sources up to date without clicking "Sync Now".

The loop looks at the sync settings on every tick, so turning automatic sync
off, or changing the interval, applies within seconds and needs no restart.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime
from typing import Callable, Dict, Optional

from phibe.connectors.sync_settings import (
    DAILY_MINUTES,
    ON_START_ONLY_MINUTES,
    SyncSettings,
    load_sync_settings,
)

logger = logging.getLogger(__name__)

DEFAULT_FIRST_DELAY_SECONDS = 20.0
DEFAULT_TICK_SECONDS = 15.0


def start_auto_sync(
    run_once: Callable[[], None],
    *,
    get_settings: Callable[[], SyncSettings] = load_sync_settings,
    first_delay: float = DEFAULT_FIRST_DELAY_SECONDS,
    tick: float = DEFAULT_TICK_SECONDS,
    seconds_per_minute: float = 60.0,
    clock: Callable[[], float] = time.monotonic,
    wall_clock: Callable[[], datetime] = datetime.now,
    stop: Optional[threading.Event] = None,
) -> tuple[threading.Thread, threading.Event]:
    """Call *run_once* on the schedule the settings ask for.

    * first run: *first_delay* seconds after start when ``on_start`` is on,
      otherwise one interval after start;
    * later runs: one interval after the previous run;
    * nothing runs while ``auto_enabled`` is off, and turning it back on
      waits one interval instead of firing at once;
    * when the interval is one day, it runs once a day at ``daily_time`` (local
      time) instead. If the computer was off at that time, it runs as soon as
      Phibe opens later that day;
    * "only when Phibe starts" (interval 0) runs exactly once, shortly after
      start, and never again until the next start — no periodic timer at all.

    Returns the daemon thread and the event that stops it. A failing
    *run_once* is logged and never ends the loop. (*seconds_per_minute* only
    exists so tests can run the schedule in milliseconds.)
    """
    stop = stop or threading.Event()

    def past_daily_time(settings: SyncSettings) -> bool:
        hour, minute = (int(part) for part in settings.daily_time.split(":"))
        moment = wall_clock()
        return (moment.hour, moment.minute) >= (hour, minute)

    def loop() -> None:
        anchor = clock()  # start, or the last run / last time it was switched on
        first = True
        was_enabled = True
        # Day on which the daily sync already ran (None = not yet today).
        done_on: Optional[date] = None
        # "Only when Phibe starts": True once this run has happened, for the
        # life of this thread (a fresh start is a fresh process).
        ran_on_start_only = False
        start_settings = get_settings()
        if (
            start_settings.interval_minutes == DAILY_MINUTES
            and not start_settings.on_start
            and past_daily_time(start_settings)
        ):
            done_on = wall_clock().date()  # do not repeat today's run on a restart
        while not stop.wait(tick):
            settings = get_settings()
            now = clock()
            if not settings.auto_enabled:
                was_enabled = False
                continue
            if not was_enabled:  # just switched back on: wait a full interval
                was_enabled, anchor, first = True, now, False
                done_on = wall_clock().date() if past_daily_time(settings) else None
            daily = settings.interval_minutes == DAILY_MINUTES
            on_start_only = settings.interval_minutes == ON_START_ONLY_MINUTES
            if on_start_only:
                due = not ran_on_start_only and now - anchor >= first_delay
            elif first and settings.on_start:
                due = now - anchor >= first_delay
            elif daily:
                due = done_on != wall_clock().date() and past_daily_time(settings)
            else:
                due = now - anchor >= settings.interval_minutes * seconds_per_minute
            if not due:
                continue
            try:
                run_once()
            except Exception:  # noqa: BLE001 - the loop must survive anything
                logger.exception("Automatic sync failed")
            anchor, first = clock(), False
            if on_start_only:
                ran_on_start_only = True
            if past_daily_time(settings):
                done_on = wall_clock().date()

    thread = threading.Thread(target=loop, name="phibe-auto-sync", daemon=True)
    thread.start()
    return thread, stop


def start_source_sync(
    run_for: Callable[[str], None],
    *,
    get_settings: Callable[[], SyncSettings] = load_sync_settings,
    first_delay: float = DEFAULT_FIRST_DELAY_SECONDS,
    tick: float = DEFAULT_TICK_SECONDS,
    seconds_per_minute: float = 60.0,
    clock: Callable[[], float] = time.monotonic,
    wall_clock: Callable[[], datetime] = datetime.now,
    stop: Optional[threading.Event] = None,
) -> tuple[threading.Thread, threading.Event]:
    """Call ``run_for(source)`` on the rhythm each source chose for itself.

    Only the sources in ``settings.intervals`` are handled here; the others
    follow the general loop. A rhythm is a number of minutes, ``0`` (only
    when Phibe starts) or one day (once a day at the source's ``daily_times``
    entry, else ``daily_time``). Nothing runs while ``auto_enabled`` is off or
    the source is switched off, and a source that was just given a rhythm
    waits for it instead of firing at once. A source that already had its
    rhythm when Phibe started runs *first_delay* seconds in when ``on_start``
    is on (always for "only when Phibe starts").
    """
    stop = stop or threading.Event()

    def loop() -> None:
        started = clock()
        last: Dict[str, float] = {}  # when each source last ran (or was armed)
        rhythm: Dict[str, int] = {}  # the rhythm each source had on the last tick
        done_on: Dict[str, date] = {}  # day a once-a-day source last ran
        startup: Optional[set] = None  # sources that had a rhythm when Phibe started
        while not stop.wait(tick):
            settings = get_settings()
            now = clock()
            today = wall_clock().date()
            active = {
                source: minutes
                for source, minutes in settings.intervals.items()
                if settings.auto_enabled and source not in settings.disabled_connectors
            }
            if startup is None:
                startup = set(active)
            for source in list(last):
                if source not in active or rhythm.get(source) != active[source]:
                    # dropped or changed: a new rhythm waits for its own turn
                    last.pop(source, None)
                    done_on.pop(source, None)
                    startup.discard(source)
            for source, minutes in active.items():
                rhythm[source] = minutes
                at = settings.daily_times.get(source, settings.daily_time)
                hour, minute = (int(part) for part in at.split(":"))
                past = (wall_clock().hour, wall_clock().minute) >= (hour, minute)
                if source not in last:
                    if source in startup and (minutes == ON_START_ONLY_MINUTES or settings.on_start):
                        if now - started < first_delay:
                            continue
                    else:
                        last[source] = now  # armed: waits for its own turn
                        if past:
                            done_on[source] = today  # today's slot is gone
                        continue
                elif minutes == ON_START_ONLY_MINUTES:
                    continue  # already ran for this start
                elif minutes == DAILY_MINUTES:
                    if done_on.get(source) == today or not past:
                        continue
                elif now - last[source] < minutes * seconds_per_minute:
                    continue
                last[source] = now
                if past:
                    done_on[source] = today
                try:
                    run_for(source)
                except Exception:  # noqa: BLE001 - one source must not stop the rest
                    logger.exception("Automatic sync failed for %s", source)

    thread = threading.Thread(target=loop, name="phibe-source-sync", daemon=True)
    thread.start()
    return thread, stop
