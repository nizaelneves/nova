"""Data for the Horizon "Computer" widget: ``/v1/widgets/computer``.

Everything is read on this machine and sent nowhere else: processor, memory, disks, graphics card,
network speed, battery, the busiest programs, and what Ollama has loaded.
"""

from __future__ import annotations

import platform
import subprocess
import sys
import threading
import time
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

import httpx
import psutil
from fastapi import APIRouter

from phibe.server.model_capabilities import is_embed_only_model

router = APIRouter(prefix="/v1/widgets", tags=["widgets"])

OLLAMA = "http://127.0.0.1:11434"
THREADS = psutil.cpu_count() or 1
TOP = 5

_lock = threading.Lock()
_net: Tuple[float, int, int] = (time.monotonic(), 0, 0)  # when, bytes received, bytes sent
psutil.cpu_percent(percpu=True)  # the first reading is always 0: take it now so the next one means something


def rate(before: int, after: int, seconds: float) -> float:
    """Bytes per second between two counter readings (never negative, even if the counter restarted)."""
    return max(0, after - before) / seconds if seconds > 0 else 0.0


def rank(rows: List[Tuple[str, float, int]]) -> Dict[str, List[Dict[str, Any]]]:
    """The programs using the most processor and memory. Programs with many processes (a browser) count once."""
    total: Dict[str, List[float]] = {}
    for name, cpu, memory in rows:
        entry = total.setdefault(name, [0.0, 0])
        entry[0] += cpu
        entry[1] += memory
    items = [{"name": name, "cpu": round(cpu, 1), "memory": int(memory)} for name, (cpu, memory) in total.items()]
    return {
        "by_cpu": sorted(items, key=lambda i: i["cpu"], reverse=True)[:TOP],
        "by_memory": sorted(items, key=lambda i: i["memory"], reverse=True)[:TOP],
    }


@lru_cache(maxsize=1)
def _cpu_name() -> str:
    try:
        if sys.platform == "win32":
            import winreg

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
                return str(winreg.QueryValueEx(key, "ProcessorNameString")[0]).strip()
        if sys.platform == "darwin":
            return subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True, timeout=2).stdout.strip()
        with open("/proc/cpuinfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except (OSError, ImportError, subprocess.SubprocessError):
        pass
    return platform.processor() or "Processor"


def _gpus() -> List[Dict[str, Any]]:
    try:
        import pynvml

        pynvml.nvmlInit()
        gpus = []
        for i in range(pynvml.nvmlDeviceGetCount()):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
            name = pynvml.nvmlDeviceGetName(handle)
            gpus.append({
                "name": name.decode() if isinstance(name, bytes) else name,
                "usage": pynvml.nvmlDeviceGetUtilizationRates(handle).gpu,
                "memory_used": memory.used,
                "memory_total": memory.total,
                "temperature": pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU),
            })
        return gpus
    except Exception:  # noqa: BLE001 - no NVIDIA card or driver (or no pynvml): the widget simply has no graphics card to show
        return []


def _disks() -> List[Dict[str, Any]]:
    disks = []
    for part in psutil.disk_partitions(all=False):
        if "cdrom" in part.opts or not part.fstype:
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except OSError:
            continue  # a drive that is not ready
        disks.append({"name": part.mountpoint, "used": usage.used, "total": usage.total})
    return disks[:6]


def _programs() -> Dict[str, List[Dict[str, Any]]]:
    rows = []
    for proc in psutil.process_iter(["name"]):
        if proc.pid == 0 or not proc.info["name"]:
            continue  # the idle process counts the unused processor, and a process without a name is not a program to show
        try:
            rows.append((proc.info["name"], proc.cpu_percent(None) / THREADS, proc.memory_info().rss))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return rank(rows)


def _ollama() -> Dict[str, Any]:
    try:
        with httpx.Client(timeout=1.5) as client:
            version = client.get(f"{OLLAMA}/api/version").json().get("version")
            installed = len(client.get(f"{OLLAMA}/api/tags").json().get("models", []))
        return {"running": True, "version": version, "installed": installed}
    except (httpx.HTTPError, ValueError, KeyError):
        return {"running": False}


@router.get("/embedding-models")
def embedding_models() -> List[Dict[str, Any]]:
    """The Ollama models kept only for meaning search (they never appear as chat models)."""
    try:
        with httpx.Client(timeout=1.5) as client:
            models = client.get(f"{OLLAMA}/api/tags").json().get("models", [])
    except (httpx.HTTPError, ValueError):
        return []
    return [{"name": m["name"], "size": m.get("size", 0)} for m in models if is_embed_only_model(m["name"])]


@router.get("/computer")
def computer() -> Dict[str, Any]:
    """The state of this machine right now."""
    global _net
    each = psutil.cpu_percent(percpu=True)
    freq = psutil.cpu_freq()
    memory, swap, battery = psutil.virtual_memory(), psutil.swap_memory(), psutil.sensors_battery()
    io = psutil.net_io_counters()
    with _lock:
        then, received, sent = _net
        now = time.monotonic()
        down, up = (rate(received, io.bytes_recv, now - then), rate(sent, io.bytes_sent, now - then)) if received else (0.0, 0.0)
        _net = (now, io.bytes_recv, io.bytes_sent)
    return {
        "os": f"{platform.system()} {platform.release()}",
        "cpu": {
            "name": _cpu_name(),
            "usage": round(sum(each) / len(each), 1) if each else 0.0,
            "cores": psutil.cpu_count(logical=False) or THREADS,
            "threads": THREADS,
            "mhz": round(freq.current) if freq else None,
            "each": each,
        },
        "memory": {"used": memory.used, "total": memory.total, "swap_used": swap.used, "swap_total": swap.total},
        "gpus": _gpus(),
        "disks": _disks(),
        "network": {"down": down, "up": up},
        "battery": None if battery is None else {
            "percent": round(battery.percent),
            "charging": bool(battery.power_plugged),
            "seconds_left": battery.secsleft if battery.secsleft >= 0 else None,
        },
        "programs": _programs(),
        "ollama": _ollama(),
        "phibe": {"memory": psutil.Process().memory_info().rss},
    }
