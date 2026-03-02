"""
mt5_bridge/app.py  — PUSH Architecture v2
==========================================
Instead of waiting for the backend to call us (pull),
we actively PUSH trade data to the backend API.

Flow:
  1. Bridge starts → reads BACKEND_URL from .env
  2. Periodically checks for pending MT5 connections from backend
  3. Connects to MT5 for each user, fetches trades/positions
  4. POSTs data to backend /api/mt5/push endpoint
  5. Backend stores and broadcasts to WebSocket users

Windows setup required:
  - Python + MetaTrader5 package
  - .env with BACKEND_URL=https://api.timejournal.site
  - Run: python app.py
  - NO port forwarding or tunneling needed!
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
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("WARNING: MetaTrader5 not installed. Run install.bat first.")

# ── Config ───────────────────────────────────────────────────────────────────
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
BRIDGE_API_KEY = os.getenv("MT5_BRIDGE_API_KEY", "changeme_secret_key_123")
PUSH_INTERVAL = int(os.getenv("MT5_POLL_INTERVAL", "10"))  # seconds
HOST = os.getenv("MT5_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))
WIB = pytz.timezone("Asia/Jakarta")

# ── Per-user connection state ─────────────────────────────────────────────────
_connections: Dict[str, dict] = {}  # user_id -> {login, server, last_sync, account}
_mt5_lock = threading.Lock()

# ── FastAPI (kept for local health check only) ────────────────────────────────
app = FastAPI(title="MT5 Bridge — Push Mode", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": "push",
        "backend_url": BACKEND_URL,
        "mt5_available": MT5_AVAILABLE,
        "active_connections": len(_connections),
        "time": datetime.datetime.now(tz=WIB).isoformat(),
    }


# ── MT5 Data Helpers ──────────────────────────────────────────────────────────
def _ts_to_utc_iso(ts: int) -> str:
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()


def _ts_to_wib_iso(ts: int) -> str:
    utc = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return utc.astimezone(WIB).isoformat()


def _detect_session(utc_dt):
    LDN = pytz.timezone("Europe/London")
    NY = pytz.timezone("America/New_York")
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


# ── Push to Backend ───────────────────────────────────────────────────────────
async def push_to_backend(payload: dict):
    """POST data to backend push webhook."""
    headers = {"X-Bridge-Key": BRIDGE_API_KEY, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{BACKEND_URL}/api/mt5/push", json=payload, headers=headers)
            if resp.status_code != 200:
                print(f"[PUSH] Backend returned {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        print(f"[PUSH] Failed to push to backend: {e}")


async def fetch_pending_connections() -> list:
    """Ask backend which users should have MT5 connections active."""
    headers = {"X-Bridge-Key": BRIDGE_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BACKEND_URL}/api/mt5/pending-connections", headers=headers)
            if resp.status_code == 200:
                return resp.json().get("connections", [])
            else:
                print(f"[PULL] Backend returned {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        print(f"[PULL] Failed to fetch pending connections: {e}")
    return []


# ── Push Loop ─────────────────────────────────────────────────────────────────
async def push_loop():
    """Main async loop: sync MT5 state and push to backend."""
    print(f"[PUSH] Starting push loop → {BACKEND_URL} (interval: {PUSH_INTERVAL}s)")
    await asyncio.sleep(3)  # brief startup delay

    while True:
        try:
            # Ensure MT5 is running locally so we can grab global prices
            if not mt5.initialize():
                await asyncio.sleep(PUSH_INTERVAL)
                continue

            # 1. Get list of users who need MT5 connections from backend
            pending = await fetch_pending_connections()
            all_symbols = set()

            for conn_info in pending:
                user_id = conn_info.get("user_id")
                login = conn_info.get("login")
                password = conn_info.get("password")
                server = conn_info.get("server")

                if not all([user_id, login, password, server]):
                    continue

                # 2. Connect if not already connected
                conn_err = None
                conn_acc = None
                with _mt5_lock:
                    current = _connections.get(user_id, {})
                    if current.get("login") != login or not mt5.terminal_info():
                        mt5.shutdown()
                        ok = mt5.initialize(login=login, password=password, server=server)
                        if not ok:
                            err = mt5.last_error()
                            print(f"[MT5] Connect failed for user {user_id}: {err}")
                            conn_err = f"MT5 connect failed: {err}"
                        else:
                            acc = _get_account_info()
                            _connections[user_id] = {"login": login, "server": server, "account": acc}
                            print(f"[MT5] Connected user {user_id}: {acc.get('name')} / {acc.get('server')}")
                            conn_acc = acc

                if conn_err:
                    await push_to_backend({"user_id": user_id, "type": "error", "message": conn_err})
                    continue
                
                if conn_acc:
                    # Push connection success
                    await push_to_backend({"user_id": user_id, "type": "connected", "account": conn_acc})

                # 3. Fetch and push data
                with _mt5_lock:
                    acc = _get_account_info()
                    _connections[user_id]["account"] = acc

                    # All trades (history) - Limit to 1 day to prevent MT5 from hanging on massive downloads
                    # (This loop runs every 10 seconds, pulling 500+ trades takes 50s and blocks live price alerts)
                    date_from = datetime.datetime.now() - datetime.timedelta(days=1)
                    date_to = datetime.datetime.now() + datetime.timedelta(hours=1)
                    print(f"[MT5] Fetching deals for user {user_id} (Last 24 hours)...")
                    deals = mt5.history_deals_get(date_from, date_to) or []
                    print(f"[MT5] Found {len(deals)} recent deals.")
                    trades = [t for deal in deals if (t := _deal_to_dict(deal)) is not None]

                    # Live positions
                    pos_list = mt5.positions_get() or []
                    positions = [_position_to_dict(p) for p in pos_list]

                # Push all data
                await push_to_backend({"user_id": user_id, "type": "all_trades", "trades": trades})
                await push_to_backend({"user_id": user_id, "type": "live_trades", "trades": positions})
                await push_to_backend({"user_id": user_id, "type": "account_update", "account": acc})
                
                # Accumulate live position symbols for global tracking
                for p in positions:
                    if p.get("symbol"):
                        all_symbols.add(p["symbol"])

            # 4. Push latest prices for alert evaluation (GLOBAL, outside user loop)
            try:
                # Fetch active alert symbols from backend so we track them even without positions
                try:
                    headers = {"X-Bridge-Key": BRIDGE_API_KEY}
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        res = await client.get(f"{BACKEND_URL}/api/mt5/alert-symbols", headers=headers)
                        if res.status_code == 200:
                            alert_syms = res.json().get("symbols", [])
                            all_symbols.update(alert_syms)
                except Exception as e:
                    print(f"[PUSH] Failed to fetch alert symbols: {e}")
                
                if all_symbols:
                    print(f"[PUSH] Evaluating symbols: {all_symbols}")
                    prices = {}
                    candles = {}
                    with _mt5_lock:
                        for sym in all_symbols:
                            # Force MetaTrader to track this symbol in the Market Watch board
                            ok = mt5.symbol_select(sym, True)
                            if not ok:
                                print(f"  [MT5] Warning: symbol_select failed for {sym}. Check symbol suffix (e.g., m, z, c)!")

                            tick = mt5.symbol_info_tick(sym)
                            if tick:
                                prices[sym] = float(tick.bid)
                            else:
                                print(f"  [MT5] Warning: tick for {sym} returned None")
                            # Also get M1 candle for candle alerts
                            try:
                                rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M1, 0, 2)
                                if rates is not None and len(rates) > 0:
                                    candles[f"{sym}_M1"] = [
                                        {"time": int(r["time"]), "open": float(r["open"]),
                                         "high": float(r["high"]), "low": float(r["low"]),
                                         "close": float(r["close"])}
                                        for r in rates
                                    ]
                                    # Also add latest candle close as fallback price
                                    if sym not in prices:
                                        prices[sym] = float(rates[-1]["close"])
                            except Exception:
                                pass
                    
                    if prices:
                        print(f"[PUSH] Pushing prices for: {list(prices.keys())}")
                        headers = {"X-Bridge-Key": BRIDGE_API_KEY, "Content-Type": "application/json"}
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            res = await client.post(
                                f"{BACKEND_URL}/api/mt5/push-prices",
                                json={"prices": prices, "candles": candles},
                                headers=headers,
                            )
                            if res.status_code != 200:
                                print(f"[PUSH] Warning: backend rejected prices ({res.status_code}): {res.text[:100]}")
                    else:
                        print(f"[PUSH] No valid prices extracted for {all_symbols}. Skipping push.")
            except Exception as e:
                print(f"[PUSH] Price push error: {e}")

            # Clean up disconnected users
            active_ids = {c.get("user_id") for c in pending}
            for uid in list(_connections.keys()):
                if uid not in active_ids:
                    del _connections[uid]
                    print(f"[MT5] Removed stale connection for user {uid}")

        except Exception as e:
            print(f"[PUSH] Loop error: {e}")

        await asyncio.sleep(PUSH_INTERVAL)


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    asyncio.create_task(push_loop())


if __name__ == "__main__":
    print(f"🚀 MT5 Bridge (Push Mode) starting")
    print(f"🌐 Pushing to backend: {BACKEND_URL}")
    print(f"⏱  Push interval: {PUSH_INTERVAL}s")
    print(f"📊 MT5 Available: {MT5_AVAILABLE}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
