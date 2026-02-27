"""
mt5_bridge/app.py
FastAPI HTTP Bridge Server for MetaTrader 5 (runs on Windows)
Exposes MT5 data via REST API for Linux backend to consume.
"""

import asyncio
import datetime
import json
import os
import threading
import time
from typing import Dict, Optional

import pytz
import uvicorn
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("WARNING: MetaTrader5 not installed. Run install.bat first.")

# ── Config ───────────────────────────────────────────────────────────────────
API_KEY = os.getenv("MT5_BRIDGE_API_KEY", "changeme_secret_key_123")
HOST = os.getenv("MT5_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))
WIB = pytz.timezone("Asia/Jakarta")

app = FastAPI(title="MT5 Bridge Server", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Per-user connection state ─────────────────────────────────────────────────
_connections: Dict[str, dict] = {}  # user_id -> {login, server, last_sync, account}
_mt5_lock = threading.Lock()        # MT5 library is single-instance per process


# ── Helpers ───────────────────────────────────────────────────────────────────
def verify_key(x_api_key: str = Header(default="")):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def _ts_to_utc_iso(ts: int) -> str:
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()


def _ts_to_wib_iso(ts: int) -> str:
    utc = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return utc.astimezone(WIB).isoformat()


def _detect_session(utc_dt):
    import pytz as _pytz
    LDN = _pytz.timezone("Europe/London")
    NY = _pytz.timezone("America/New_York")
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=datetime.timezone.utc)
    lh = utc_dt.astimezone(LDN).hour
    nh = utc_dt.astimezone(NY).hour
    if 8 <= lh < 17 and 8 <= nh < 17: return "Overlap (LDN+NY)"
    if 8 <= lh < 17: return "London"
    if 8 <= nh < 17: return "New York"
    if 0 <= utc_dt.hour < 9: return "Tokyo"
    return "Sydney"


def _calc_pips(symbol, open_p, close_p, direction):
    diff = (close_p - open_p) if direction == "BUY" else (open_p - close_p)
    s = symbol.upper()
    if "JPY" in s: pip = 0.01
    elif any(x in s for x in ["XAU", "GOLD"]): pip = 0.1
    elif any(x in s for x in ["XAG", "SILVER"]): pip = 0.01
    elif any(x in s for x in ["BTC", "BITCOIN"]): pip = 1.0
    elif any(x in s for x in ["ETH", "ETHEREUM"]): pip = 0.1
    elif any(x in s for x in ["NAS", "US100", "DOW", "US30"]): pip = 1.0
    elif any(x in s for x in ["SPX", "US500"]): pip = 0.1
    elif any(x in s for x in ["DAX", "GER"]): pip = 1.0
    elif any(x in s for x in ["OIL", "WTI"]): pip = 0.01
    else: pip = 0.0001
    return round(diff / pip, 1) if pip else 0.0


def _position_to_dict(pos) -> dict:
    utc = datetime.datetime.fromtimestamp(pos.time, tz=datetime.timezone.utc)
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    dur = int((now - utc).total_seconds() * 1000)
    direction = "BUY" if pos.type == 0 else "SELL"
    return {
        "id": f"live_{pos.ticket}", "ticket": pos.ticket,
        "symbol": pos.symbol, "type": direction,
        "lots": round(pos.volume, 2),
        "openTime": _ts_to_utc_iso(pos.time), "openTimeWIB": _ts_to_wib_iso(pos.time),
        "closeTime": now.isoformat(), "closeTimeWIB": datetime.datetime.now(tz=WIB).isoformat(),
        "openPrice": pos.price_open, "closePrice": pos.price_current,
        "sl": pos.sl, "tp": pos.tp,
        "pnl": round(pos.profit, 2),
        "pips": _calc_pips(pos.symbol, pos.price_open, pos.price_current, direction),
        "swap": round(pos.swap, 2), "commission": 0.0, "rr": 0.0,
        "session": _detect_session(utc), "setup": "Live Position", "emotion": "Neutral",
        "status": "live", "closeType": "all", "durationMs": dur, "isIntraday": True,
    }


def _deal_to_dict(deal) -> Optional[dict]:
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
        "openTime": _ts_to_utc_iso(open_ts), "openTimeWIB": _ts_to_wib_iso(open_ts),
        "closeTime": _ts_to_utc_iso(deal.time), "closeTimeWIB": _ts_to_wib_iso(deal.time),
        "openPrice": open_price, "closePrice": deal.price,
        "sl": sl, "tp": tp, "pnl": round(deal.profit, 2),
        "pips": _calc_pips(sym, open_price, deal.price, direction),
        "swap": round(deal.swap, 2), "commission": round(deal.commission, 2), "rr": rr,
        "session": _detect_session(open_utc), "setup": "MT5 Import", "emotion": "Neutral",
        "status": "closed", "closeType": close_type, "durationMs": dur,
        "isIntraday": dur < 86400000,
    }


def _get_account_info() -> dict:
    acc = mt5.account_info()
    if not acc: return {}
    return {
        "login": acc.login, "name": acc.name, "server": acc.server,
        "balance": acc.balance, "equity": acc.equity, "margin": acc.margin,
        "freeMargin": acc.margin_free, "profit": acc.profit,
        "currency": acc.currency, "leverage": acc.leverage,
    }


# ── Models ─────────────────────────────────────────────────────────────────────
class ConnectRequest(BaseModel):
    user_id: str
    login: int
    password: str
    server: str


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "mt5_available": MT5_AVAILABLE,
        "active_connections": len(_connections),
        "time": datetime.datetime.now(tz=WIB).isoformat(),
    }


@app.post("/connect")
def connect(req: ConnectRequest, x_api_key: str = Header(default="")):
    verify_key(x_api_key)
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=500, detail="MetaTrader5 not installed")

    with _mt5_lock:
        # MT5 Python library is single-instance — initialize with new credentials
        if not mt5.initialize(login=req.login, password=req.password, server=req.server):
            err = mt5.last_error()
            raise HTTPException(status_code=400, detail=f"MT5 init failed: {err}")

        acc = _get_account_info()
        _connections[req.user_id] = {
            "login": req.login,
            "server": req.server,
            "account": acc,
            "last_sync": datetime.datetime.utcnow().isoformat(),
        }
        return {"success": True, "account": acc}


@app.delete("/disconnect")
def disconnect(user_id: str, x_api_key: str = Header(default="")):
    verify_key(x_api_key)
    if user_id in _connections:
        del _connections[user_id]
    with _mt5_lock:
        mt5.shutdown()
    return {"success": True}


@app.get("/status")
def status(user_id: str, x_api_key: str = Header(default="")):
    verify_key(x_api_key)
    conn = _connections.get(user_id)
    if not conn:
        return {"connected": False}
    with _mt5_lock:
        if not mt5.terminal_info():
            _connections.pop(user_id, None)
            return {"connected": False}
        acc = _get_account_info()
        conn["account"] = acc
    return {"connected": True, "account": acc, "lastSync": conn.get("last_sync")}


@app.get("/account")
def account(user_id: str, x_api_key: str = Header(default="")):
    verify_key(x_api_key)
    if user_id not in _connections:
        raise HTTPException(status_code=404, detail="Not connected")
    with _mt5_lock:
        acc = _get_account_info()
    _connections[user_id]["last_sync"] = datetime.datetime.utcnow().isoformat()
    _connections[user_id]["account"] = acc
    return acc


@app.get("/trades")
def trades(user_id: str, x_api_key: str = Header(default="")):
    """Get all historical closed trades."""
    verify_key(x_api_key)
    if user_id not in _connections:
        raise HTTPException(status_code=404, detail="Not connected")
    with _mt5_lock:
        date_from = datetime.datetime(2000, 1, 1)
        date_to = datetime.datetime.now() + datetime.timedelta(hours=1)
        deals = mt5.history_deals_get(date_from, date_to) or []
        result = [t for deal in deals if (t := _deal_to_dict(deal)) is not None]
    _connections[user_id]["last_sync"] = datetime.datetime.utcnow().isoformat()
    return {"trades": result, "total": len(result)}


@app.get("/positions")
def positions(user_id: str, x_api_key: str = Header(default="")):
    """Get current live open positions."""
    verify_key(x_api_key)
    if user_id not in _connections:
        raise HTTPException(status_code=404, detail="Not connected")
    with _mt5_lock:
        pos_list = mt5.positions_get() or []
        live = [_position_to_dict(p) for p in pos_list]
    return {"positions": live, "total": len(live)}


@app.get("/recent_trades")
def recent_trades(user_id: str, hours: int = 1, x_api_key: str = Header(default="")):
    """Get trades closed in the last N hours (for polling new closes)."""
    verify_key(x_api_key)
    if user_id not in _connections:
        raise HTTPException(status_code=404, detail="Not connected")
    with _mt5_lock:
        from_dt = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(hours=hours)
        to_dt = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=1)
        deals = mt5.history_deals_get(from_dt, to_dt) or []
        result = [t for deal in deals if (t := _deal_to_dict(deal)) is not None]
    return {"trades": result, "total": len(result)}


if __name__ == "__main__":
    print(f"🚀 MT5 Bridge Server starting on port {PORT}")
    print(f"🔑 API Key: {API_KEY}")
    print(f"📊 MT5 Available: {MT5_AVAILABLE}")
    uvicorn.run(app, host=HOST, port=PORT)
