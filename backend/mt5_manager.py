"""
backend/mt5_manager.py
Per-user MT5 subprocess manager.

Architecture:
  - MT5WorkerManager: singleton that manages {user_id -> MT5WorkerProcess}
  - MT5WorkerProcess: spawns a child Python process that connects to MT5,
    polls trades/positions, and sends JSON lines to parent via stdout pipe.
  - Parent reads lines async and calls registered callbacks to broadcast
    data to the user's WebSocket connections.

Why subprocesses?
  The MetaTrader5 Python library maintains ONE global MT5 connection per
  Python process. Separate processes = separate MT5 connections = true
  per-user concurrent sync.
"""

import asyncio
import json
import os
import sys
import subprocess
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# ── Worker script (runs inside each subprocess) ─────────────────────────────
_WORKER_SCRIPT = """
import sys
import json
import time
import datetime
import pytz

WIB = pytz.timezone("Asia/Jakarta")

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

def to_wib_iso(ts: int) -> str:
    utc = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return utc.astimezone(WIB).isoformat()

def to_utc_iso(ts: int) -> str:
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()

def detect_session(utc_dt):
    import pytz as _pytz
    LDN = _pytz.timezone("Europe/London")
    NY  = _pytz.timezone("America/New_York")
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=datetime.timezone.utc)
    lh = utc_dt.astimezone(LDN).hour
    nh = utc_dt.astimezone(NY).hour
    if 8 <= lh < 17 and 8 <= nh < 17: return "Overlap (LDN+NY)"
    if 8 <= lh < 17: return "London"
    if 8 <= nh < 17: return "New York"
    if 0 <= utc_dt.hour < 9: return "Tokyo"
    return "Sydney"

def calc_pips(symbol, open_p, close_p, direction):
    diff = (close_p - open_p) if direction == "BUY" else (open_p - close_p)
    s = symbol.upper()
    if "JPY" in s: pip = 0.01
    elif any(x in s for x in ["XAU","GOLD"]): pip = 0.1
    elif any(x in s for x in ["XAG","SILVER"]): pip = 0.01
    elif any(x in s for x in ["BTC","BITCOIN"]): pip = 1.0
    elif any(x in s for x in ["ETH","ETHEREUM"]): pip = 0.1
    elif any(x in s for x in ["NAS","US100","DOW","US30"]): pip = 1.0
    elif any(x in s for x in ["SPX","US500"]): pip = 0.1
    elif any(x in s for x in ["DAX","GER"]): pip = 1.0
    elif any(x in s for x in ["OIL","WTI"]): pip = 0.01
    else: pip = 0.0001
    return round(diff / pip, 1) if pip else 0.0

def send(msg: dict):
    print(json.dumps(msg), flush=True)

def position_to_trade(pos):
    utc = datetime.datetime.fromtimestamp(pos.time, tz=datetime.timezone.utc)
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    dur = int((now - utc).total_seconds() * 1000)
    direction = "BUY" if pos.type == 0 else "SELL"
    pips = calc_pips(pos.symbol, pos.price_open, pos.price_current, direction)
    return {
        "id": f"live_{pos.ticket}", "ticket": pos.ticket,
        "symbol": pos.symbol, "type": direction,
        "lots": round(pos.volume, 2),
        "openTime": to_utc_iso(pos.time), "openTimeWIB": to_wib_iso(pos.time),
        "closeTime": now.isoformat(), "closeTimeWIB": datetime.datetime.now(tz=WIB).isoformat(),
        "openPrice": pos.price_open, "closePrice": pos.price_current,
        "sl": pos.sl, "tp": pos.tp,
        "pnl": round(pos.profit, 2), "pips": pips,
        "swap": round(pos.swap, 2), "commission": 0.0, "rr": 0.0,
        "session": detect_session(utc), "setup": "Live Position", "emotion": "Neutral",
        "status": "live", "closeType": "all", "durationMs": dur, "isIntraday": True,
    }

def deal_to_trade(deal):
    if not hasattr(deal, "entry") or deal.entry != 1: return None
    if deal.type not in (0, 1): return None
    direction = "BUY" if deal.type == 1 else "SELL"
    open_ts = deal.time
    open_price = deal.price
    try:
        pos_deals = mt5.history_deals_get(position=deal.position_id) or []
        for d in pos_deals:
            if d.entry == 0:
                open_ts = d.time; open_price = d.price; break
    except: pass
    open_utc = datetime.datetime.fromtimestamp(open_ts, tz=datetime.timezone.utc)
    close_utc = datetime.datetime.fromtimestamp(deal.time, tz=datetime.timezone.utc)
    dur = max(int((close_utc - open_utc).total_seconds() * 1000), 0)
    sym = deal.symbol or ""
    pips = calc_pips(sym, open_price, deal.price, direction)
    close_type = "manually_closed"
    reason = getattr(deal, "reason", 0)
    comment = getattr(deal, "comment", "").lower()
    if reason == 4 or "sl" in comment: close_type = "stopped_out"
    elif reason == 5 or "tp" in comment: close_type = "target_hit"
    order_info = None
    try:
        orders = mt5.history_orders_get(position=deal.position_id) or []
        if orders: order_info = orders[-1]
    except: pass
    sl = getattr(order_info, "sl", 0.0) if order_info else 0.0
    tp = getattr(order_info, "tp", 0.0) if order_info else 0.0
    if close_type == "manually_closed" and order_info and deal.price > 0:
        tol = deal.price * 0.002
        if sl > 0 and abs(deal.price - sl) <= tol: close_type = "stopped_out"
        elif tp > 0 and abs(deal.price - tp) <= tol: close_type = "target_hit"
    rr = 0.0
    if sl > 0 and tp > 0 and deal.price != 0:
        rr = round(abs(tp - deal.price) / max(abs(deal.price - sl), 0.00001), 2)
    return {
        "id": str(deal.ticket), "ticket": deal.ticket, "symbol": sym, "type": direction,
        "lots": round(deal.volume, 2),
        "openTime": to_utc_iso(open_ts), "openTimeWIB": to_wib_iso(open_ts),
        "closeTime": to_utc_iso(deal.time), "closeTimeWIB": to_wib_iso(deal.time),
        "openPrice": open_price, "closePrice": deal.price,
        "sl": sl, "tp": tp, "pnl": round(deal.profit, 2), "pips": pips,
        "swap": round(deal.swap, 2), "commission": round(deal.commission, 2), "rr": rr,
        "session": detect_session(open_utc), "setup": "MT5 Import", "emotion": "Neutral",
        "status": "closed", "closeType": close_type, "durationMs": dur, "isIntraday": dur < 86400000,
    }

def get_account(login):
    acc = mt5.account_info()
    if not acc: return {}
    return {
        "login": acc.login, "name": acc.name, "server": acc.server,
        "balance": acc.balance, "equity": acc.equity, "margin": acc.margin,
        "freeMargin": acc.margin_free, "profit": acc.profit,
        "currency": acc.currency, "leverage": acc.leverage,
    }

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--login", type=int, required=True)
parser.add_argument("--password", required=True)
parser.add_argument("--server", required=True)
parser.add_argument("--interval", type=int, default=10)
args = parser.parse_args()

if not MT5_AVAILABLE:
    send({"type": "error", "message": "MetaTrader5 not available in this environment"})
    sys.exit(1)

terminal_path = os.environ.get("MT5_TERMINAL_PATH")
init_kwargs = {
    "login": args.login,
    "password": args.password,
    "server": args.server
}
if terminal_path:
    init_kwargs["path"] = terminal_path

if not mt5.initialize(**init_kwargs):
    err = mt5.last_error()
    send({"type": "error", "message": f"MT5 init failed: {err}"})
    sys.exit(1)

send({"type": "connected", "account": get_account(args.login)})

# Initial full history fetch - send in batches to avoid pipe limit issues
date_from = datetime.datetime(2000, 1, 1)
date_to = datetime.datetime.now() + datetime.timedelta(hours=1)
deals = mt5.history_deals_get(date_from, date_to) or []

known_ids = set()
batch = []
for deal in deals:
    t = deal_to_trade(deal)
    if t: 
        known_ids.add(t["id"])
        batch.append(t)
        if len(batch) >= 50:
            send({"type": "history_batch", "trades": batch})
            batch = []
if batch:
    send({"type": "history_batch", "trades": batch})

# Live polling loop
while True:
    time.sleep(args.interval)
    try:
        # Account update
        acc = get_account(args.login)
        send({"type": "account_update", "account": acc})

        # Live positions
        positions = mt5.positions_get() or []
        live = [position_to_trade(p) for p in positions]
        send({"type": "live_trades", "trades": live})

        # New closed trades
        from_dt = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(hours=1)
        to_dt = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=1)
        recent_deals = mt5.history_deals_get(from_dt, to_dt) or []
        for deal in recent_deals:
            t = deal_to_trade(deal)
            if t and t["id"] not in known_ids:
                known_ids.add(t["id"])
                send({"type": "new_trade", "trade": t})
    except Exception as e:
        send({"type": "error", "message": str(e)})
"""

# ── MT5WorkerProcess ─────────────────────────────────────────────────────────
class MT5WorkerProcess:
    def __init__(self, user_id: str, login: int, password: str, server: str, interval: int = 10):
        self.user_id = user_id
        self.login = login
        self.password = password
        self.server = server
        self.interval = interval
        self._proc: Optional[subprocess.Popen] = None
        self._task: Optional[asyncio.Task] = None
        self._callbacks: list[Callable] = []

    def add_callback(self, cb: Callable):
        """Register a callback(user_id, msg_dict) for incoming messages."""
        self._callbacks.append(cb)

    def remove_callback(self, cb: Callable):
        if cb in self._callbacks:
            self._callbacks.remove(cb)

    async def start(self):
        """Spawn the worker subprocess and start reading its output."""
        script_path = os.path.join(os.path.dirname(__file__), "_mt5_worker_script.py")
        # Write worker script to disk
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(_WORKER_SCRIPT)

        # Prepare environment for the subprocess
        env = os.environ.copy()
        env["DISPLAY"] = os.environ.get("DISPLAY", ":99")
        env["WINEPREFIX"] = os.environ.get("WINEPREFIX", "/root/.wine")
        # Disable some wine popups/logs to keep it clean
        env["WINEDEBUG"] = "-all"
        env["WINEDLLOVERRIDES"] = "mscoree,mshtml=n"

        # On Linux, we must run the worker script via Wine's Windows Python
        executable = sys.executable
        args = [script_path]
        
        if sys.platform == "linux":
            # We try to use 'wine python' which relies on the PATH inside Wine.
            # If that fails, we log the attempt clearly.
            executable = "wine"
            args = ["python", script_path]
            logger.info(f"Linux detected: Using Wine to launch worker. Prefix: {env['WINEPREFIX']}")

        self._proc = await asyncio.create_subprocess_exec(
            executable, *args,
            "--login", str(self.login),
            "--password", self.password,
            "--server", self.server,
            "--interval", str(self.interval),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        self._task = asyncio.create_task(self._read_loop())
        logger.info(f"MT5 worker started for user {self.user_id} (pid={self._proc.pid})")

    async def _read_loop(self):
        """Read JSON lines from worker stdout and dispatch to callbacks."""
        try:
            # Create a task to log stderr for debugging
            stderr_task = asyncio.create_task(self._read_stderr())
            
            while self._proc and self._proc.stdout:
                line = await self._proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode().strip())
                    for cb in list(self._callbacks):
                        try:
                            await cb(self.user_id, msg)
                        except Exception as e:
                            logger.error(f"MT5 callback error: {e}")
                except json.JSONDecodeError:
                    pass
            
            await stderr_task
        except Exception as e:
            logger.error(f"MT5 read loop error for user {self.user_id}: {e}")
        logger.info(f"MT5 worker read loop ended for user {self.user_id}")

    async def _read_stderr(self):
        """Read and log stderr from the subprocess."""
        try:
            while self._proc and self._proc.stderr:
                line = await self._proc.stderr.readline()
                if not line:
                    break
                logger.error(f"MT5 Worker {self.user_id} STDERR: {line.decode().strip()}")
        except Exception as e:
            logger.error(f"MT5 stderr read loop error: {e}")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._proc:
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except Exception:
                self._proc.kill()
        self._proc = None
        logger.info(f"MT5 worker stopped for user {self.user_id}")

    @property
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None


# ── MT5WorkerManager ─────────────────────────────────────────────────────────
class MT5WorkerManager:
    """Singleton that manages per-user MT5 worker subprocesses."""

    def __init__(self):
        self._workers: dict[str, MT5WorkerProcess] = {}

    async def connect(
        self,
        user_id: str,
        login: int,
        password: str,
        server: str,
        callback: Callable,
        interval: int = 10,
    ) -> MT5WorkerProcess:
        """Start (or reuse) a worker for this user."""
        if user_id in self._workers:
            worker = self._workers[user_id]
            if worker.is_running:
                worker.add_callback(callback)
                return worker
            else:
                await worker.stop()

        worker = MT5WorkerProcess(user_id, login, password, server, interval)
        worker.add_callback(callback)
        self._workers[user_id] = worker
        await worker.start()
        return worker

    async def disconnect(self, user_id: str):
        if user_id in self._workers:
            await self._workers[user_id].stop()
            del self._workers[user_id]

    def get_worker(self, user_id: str) -> Optional[MT5WorkerProcess]:
        return self._workers.get(user_id)

    def is_connected(self, user_id: str) -> bool:
        w = self._workers.get(user_id)
        return w is not None and w.is_running

    async def shutdown_all(self):
        for worker in list(self._workers.values()):
            await worker.stop()
        self._workers.clear()


# Singleton instance
mt5_manager = MT5WorkerManager()
