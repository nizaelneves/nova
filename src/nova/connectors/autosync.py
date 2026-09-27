"""Keep connected sources up to date without clicking "Sync Now".

The loop looks at the sync settings on every tick, so turning automatic sync
off, or changing the interval, applies within seconds and needs no restart.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable, Optional

from nova.connectors.sync_settings import SyncSettings, load_sync_settings

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
    stop: Optional[threading.Event] = None,
) -> tuple[threading.Thread, threading.Event]:
    """Call *run_once* on the schedule the settings ask for.

    * first run: *first_delay* seconds after start when ``on_start`` is on,
      otherwise one interval after start;
    * later runs: one interval after the previous run;
    * nothing runs while ``auto_enabled`` is off, and turning it back on
      waits one interval instead of firing at once.

    Returns the daemon thread and the event that stops it. A failing
    *run_once* is logged and never ends the loop. (*seconds_per_minute* only
    exists so tests can run the schedule in milliseconds.)
    """
    stop = stop or threading.Event()

    def loop() -> None:
        anchor = clock()  # start, or the last run / last time it was switched on
        first = True
        was_enabled = True
        while not stop.wait(tick):
            settings = get_settings()
            now = clock()
            if not settings.auto_enabled:
                was_enabled = False
                continue
            if not was_enabled:  # just switched back on: wait a full interval
                was_enabled, anchor, first = True, now, False
            interval = settings.interval_minutes * seconds_per_minute
            wait = first_delay if first and settings.on_start else interval
            if now - anchor < wait:
                continue
            try:
                run_once()
            except Exception:  # noqa: BLE001 - the loop must survive anything
                logger.exception("Automatic sync failed")
            anchor, first = clock(), False

    thread = threading.Thread(target=loop, name="nova-auto-sync", daemon=True)
    thread.start()
    return thread, stop
