"""Keep connected sources up to date without clicking "Sync Now".

The loop looks at the sync settings on every tick, so turning automatic sync
off, or changing the interval, applies within seconds and needs no restart.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime
from typing import Callable, Optional

from phi.connectors.sync_settings import (
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
      Phi opens later that day;
    * "only when Phi starts" (interval 0) runs exactly once, shortly after
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
        # "Only when Phi starts": True once this run has happened, for the
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

    thread = threading.Thread(target=loop, name="phi-auto-sync", daemon=True)
    thread.start()
    return thread, stop
