"""
UltraJournal MT5 Backend v2
============================
FastAPI + WebSocket server for live MT5 integration.

Install:
    pip install fastapi uvicorn websockets MetaTrader5 python-dotenv

Run:
    python main.py
    # → http://localhost:8000
    # → Docs: http://localhost:8000/docs
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime
import asyncio
import json
import pytz
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

# ── MT5 Import ────────────────────────────────────────────────────────────────
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
    print("✅ MetaTrader5 library loaded")
except ImportError:
    MT5_AVAILABLE = False
    print("⚠ MetaTrader5 not available (non-Windows). Using mock mode.")

# ── xAI (Grok) Import ─────────────────────────────────────────────────────────
try:
    from openai import OpenAI
    api_key = os.getenv("XAI_API_KEY")
    if api_key:
        ai_client = OpenAI(
            api_key=api_key,
            base_url="https://api.x.ai/v1"
        )
        XAI_AVAILABLE = True
        print("✅ xAI (Grok) loaded via OpenAI SDK")
    else:
        XAI_AVAILABLE = False
        print("⚠ XAI_API_KEY not found in .env")
except ImportError:
    XAI_AVAILABLE = False
    print("⚠ openai package missing.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(live_updater())
    yield
    task.cancel()

app = FastAPI(title="UltraJournal MT5 API v2", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WIB = pytz.timezone("Asia/Jakarta")

# ── State ─────────────────────────────────────────────────────────────────────
_connected = False
_conn_params: Dict = {}
_cached_trades: List[Dict] = []
_cached_live: List[Dict] = []
_account_info: Dict = {}
_ws_clients: List[WebSocket] = []

# ── Models ────────────────────────────────────────────────────────────────────
class ConnectRequest(BaseModel):
    login: int
    password: str
    server: str
    port: int = 443

class CandleRequestItem(BaseModel):
    symbol: str
    timeframe: str

class CandlesRequest(BaseModel):
    items: List[CandleRequestItem]

class AIAnalyzeRequest(BaseModel):
    totalTrades: int
    winRate: float
    totalPnl: float
    bestSymbol: str
    worstSymbol: str
    recentStreaks: str = ""
    notes: str = ""

# ── Helpers ───────────────────────────────────────────────────────────────────
def to_wib_iso(timestamp: int) -> str:
    """Convert MT5 unix timestamp to WIB ISO string."""
    utc = datetime.datetime.fromtimestamp(timestamp, tz=datetime.timezone.utc)
    wib = utc.astimezone(WIB)
    return wib.isoformat()

def to_utc_iso(timestamp: int) -> str:
    utc = datetime.datetime.fromtimestamp(timestamp, tz=datetime.timezone.utc)
    return utc.isoformat()

def detect_session(utc_hour: int) -> str:
    if 12 <= utc_hour < 16: return "Overlap (LDN+NY)"
    if 7  <= utc_hour < 16: return "London"
    if 12 <= utc_hour < 21: return "New York"
    if 0  <= utc_hour < 9:  return "Tokyo"
    return "Sydney"

def calc_pips(symbol: str, open_price: float, close_price: float, direction: str) -> float:
    diff = (close_price - open_price) if direction == "BUY" else (open_price - close_price)
    s = symbol.upper()
    if "JPY" in s: pip = 0.01
    elif "XAU" in s or "GOLD" in s: pip = 0.1
    elif "XAG" in s or "SILVER" in s: pip = 0.01
    elif "BTC" in s or "BITCOIN" in s: pip = 1.0
    elif "ETH" in s or "ETHEREUM" in s: pip = 0.1
    elif "NAS" in s or "US100" in s: pip = 1.0
    elif "SPX" in s or "US500" in s: pip = 0.1
    elif "DOW" in s or "US30" in s: pip = 1.0
    elif "DAX" in s or "GER" in s: pip = 1.0
    elif "OIL" in s or "WTI" in s: pip = 0.01
    else: pip = 0.0001
    return round(diff / pip, 1)

def deal_to_trade(deal) -> Optional[Dict]:
    """Convert MT5 deal to trade dict."""
    if not hasattr(deal, 'entry') or deal.entry != 1:  # 1 = OUT (close)
        return None
    if deal.type not in (0, 1):  # 0=buy, 1=sell
        return None

    # A deal that closes a BUY position is a SELL deal (type 1)
    # A deal that closes a SELL position is a BUY deal (type 0)
    direction = "BUY" if deal.type == 1 else "SELL"
    open_time_ts = deal.time
    close_time_ts = deal.time
    open_price = deal.price

    # Try to find matching open deal for accurate open time and price
    try:
        if MT5_AVAILABLE:
            position_deals = mt5.history_deals_get(position=deal.position_id)
            if position_deals:
                for d in position_deals:
                    if d.entry == 0:  # ENTRY_IN
                        open_time_ts = d.time
                        open_price = d.price
                        break
    except Exception:
        pass

    open_dt_utc = datetime.datetime.fromtimestamp(open_time_ts, tz=datetime.timezone.utc)
    close_dt_utc = datetime.datetime.fromtimestamp(close_time_ts, tz=datetime.timezone.utc)
    duration_ms = max(int((close_dt_utc - open_dt_utc).total_seconds() * 1000), 0)

    symbol = deal.symbol or ""
    pips = calc_pips(symbol, open_price, deal.price, direction)

    # Determine close type by checking MT5 deal reason
    # 4 = DEAL_REASON_SL, 5 = DEAL_REASON_TP
    close_type = "manually_closed"
    reason = getattr(deal, 'reason', 0)
    comment = getattr(deal, 'comment', '').lower()
    
    if reason == 4 or "sl" in comment:
        close_type = "stopped_out"
    elif reason == 5 or "tp" in comment:
        close_type = "target_hit"
    elif reason == 6 or "so " in comment or "margin" in comment: # Stop out (margin cut)
        close_type = "stopped_out"

    order_info = None
    try:
        if MT5_AVAILABLE:
            orders = mt5.history_orders_get(position=deal.position_id)
            if orders:
                order_info = orders[-1] if orders else None
    except Exception:
        pass

    sl = getattr(order_info, 'sl', 0.0) if order_info else 0.0
    tp = getattr(order_info, 'tp', 0.0) if order_info else 0.0
    
    # Smart proximity check backup for brokers providing blank comments/reasons.
    # We use a 0.2% price tolerance to accommodate severe slippage on Gold/Crypto
    # rather than a fixed 0.0005 pip threshold which only works on Forex pairs.
    if close_type == "manually_closed" and order_info and deal.price > 0:
        tolerance = deal.price * 0.002 
        if sl > 0 and abs(deal.price - sl) <= tolerance:
             close_type = "stopped_out"
        elif tp > 0 and abs(deal.price - tp) <= tolerance:
             close_type = "target_hit"

    rr = 0.0
    if sl > 0 and tp > 0 and deal.price != 0:
        rr = round(abs(tp - deal.price) / max(abs(deal.price - sl), 0.00001), 2)

    return {
        "id": str(deal.ticket),
        "ticket": deal.ticket,
        "symbol": symbol,
        "type": direction,
        "lots": round(deal.volume, 2),
        "openTime": to_utc_iso(open_time_ts),
        "openTimeWIB": to_wib_iso(open_time_ts),
        "closeTime": to_utc_iso(close_time_ts),
        "closeTimeWIB": to_wib_iso(close_time_ts),
        "openPrice": open_price,
        "closePrice": deal.price,
        "sl": sl, "tp": tp,
        "pnl": round(deal.profit, 2),
        "pips": pips,
        "swap": round(deal.swap, 2),
        "commission": round(deal.commission, 2),
        "rr": rr,
        "session": detect_session(open_dt_utc.hour),
        "setup": "MT5 Import",
        "emotion": "Neutral",
        "status": "closed",
        "closeType": close_type,
        "durationMs": duration_ms,
        "isIntraday": duration_ms < 86400000,
    }

def position_to_trade(pos) -> Dict:
    """Convert MT5 live position to trade dict."""
    open_dt_utc = datetime.datetime.fromtimestamp(pos.time, tz=datetime.timezone.utc)
    now_utc = datetime.datetime.now(tz=datetime.timezone.utc)
    duration_ms = int((now_utc - open_dt_utc).total_seconds() * 1000)
    direction = "BUY" if pos.type == 0 else "SELL"
    pips = calc_pips(pos.symbol, pos.price_open, pos.price_current, direction)

    return {
        "id": f"live_{pos.ticket}",
        "ticket": pos.ticket,
        "symbol": pos.symbol,
        "type": direction,
        "lots": round(pos.volume, 2),
        "openTime": to_utc_iso(pos.time),
        "openTimeWIB": to_wib_iso(pos.time),
        "closeTime": now_utc.isoformat(),
        "closeTimeWIB": datetime.datetime.now(tz=WIB).isoformat(),
        "openPrice": pos.price_open,
        "closePrice": pos.price_current,
        "sl": pos.sl, "tp": pos.tp,
        "pnl": round(pos.profit, 2),
        "pips": pips,
        "swap": round(pos.swap, 2),
        "commission": 0.0, "rr": 0.0,
        "session": detect_session(open_dt_utc.hour),
        "setup": "Live Position",
        "emotion": "Neutral",
        "status": "live",
        "closeType": "all",
        "durationMs": duration_ms,
        "isIntraday": True,
    }

def get_account_dict() -> Dict:
    """Get current account info from MT5."""
    if not MT5_AVAILABLE or not _connected:
        return _account_info
    acc = mt5.account_info()
    if not acc:
        return _account_info
    return {
        "login": acc.login,
        "name": acc.name,
        "server": acc.server,
        "balance": acc.balance,      # ← actual MT5 balance
        "equity": acc.equity,        # ← includes open P&L
        "margin": acc.margin,
        "freeMargin": acc.margin_free,
        "profit": acc.profit,        # ← unrealized profit
        "currency": acc.currency,
        "leverage": acc.leverage,
    }

# ── WebSocket broadcast ────────────────────────────────────────────────────────
async def broadcast(msg: dict):
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)

# ── Background live updater ────────────────────────────────────────────────────
async def live_updater():
    """Poll MT5 every 10s and broadcast live position updates and new closed trades."""
    global _cached_live, _cached_trades, _account_info
    while True:
        await asyncio.sleep(10)
        if not _connected or not MT5_AVAILABLE:
            continue
        try:
            acc = get_account_dict()
            _account_info = acc
            positions = mt5.positions_get()
            live = [position_to_trade(p) for p in positions] if positions else []
            _cached_live = live
            await broadcast({ "type": "account_update", "account": acc })
            await broadcast({ "type": "live_trades", "trades": live })

            # Check for any newly closed trades
            last_trade_time = None
            if _cached_trades:
                last_trade_time = max(t["closeTime"] for t in _cached_trades)

            if last_trade_time:
                try:
                    date_from = datetime.datetime.fromisoformat(last_trade_time.replace("Z","")).replace(tzinfo=datetime.timezone.utc)
                    date_to = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=1)
                    deals = mt5.history_deals_get(date_from, date_to) or []
                    existing_ids = {t["id"] for t in _cached_trades}
                    for deal in deals:
                        t = deal_to_trade(deal)
                        if t and t["id"] not in existing_ids:
                            _cached_trades.insert(0, t)
                            await broadcast({ "type": "new_trade", "trade": t })
                except Exception as e:
                    print(f"Sync new trades error: {e}")

        except Exception as e:
            print(f"Live updater error: {e}")

# ── WebSocket endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws/mt5")
async def ws_mt5(ws: WebSocket):
    await ws.accept()
    _ws_clients.append(ws)
    # Send current state immediately
    await ws.send_text(json.dumps({ "type": "account_update", "account": _account_info }))
    await ws.send_text(json.dumps({ "type": "live_trades", "trades": _cached_live }))
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        if ws in _ws_clients:
            _ws_clients.remove(ws)

# ── REST Endpoints ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return { "status": "ok", "mt5_available": MT5_AVAILABLE, "connected": _connected }

@app.post("/api/mt5/connect")
async def connect_mt5(req: ConnectRequest):
    global _connected, _cached_trades, _cached_live, _account_info, _conn_params

    if not MT5_AVAILABLE:
        # Mock mode
        mock = _generate_mock()
        _cached_trades = mock
        _connected = True
        _conn_params = {"login": req.login, "server": req.server}
        _account_info = {
            "login": req.login, "name": "Demo Account", "server": req.server,
            "balance": 10000.0, "equity": 10000.0, "margin": 0, "freeMargin": 10000.0,
            "profit": 0, "currency": "USD", "leverage": 100,
        }
        return { "success": True, "message": "Mock mode (MT5 unavailable)", "account": _account_info, "trades": mock, "live_trades": [], "total": len(mock) }

    # Initialize MT5
    if not mt5.initialize(login=req.login, password=req.password, server=req.server):
        err = mt5.last_error()
        raise HTTPException(status_code=401, detail=f"MT5 init failed: {err}")

    # Get real account info
    acc = mt5.account_info()
    if not acc:
        mt5.shutdown()
        raise HTTPException(status_code=401, detail="Cannot get account info")

    _account_info = get_account_dict()
    _conn_params = {"login": req.login, "server": req.server}
    _connected = True

    # Fetch 90 days history
    date_from = datetime.datetime.now() - datetime.timedelta(days=90)
    date_to   = datetime.datetime.now() + datetime.timedelta(hours=1)
    deals = mt5.history_deals_get(date_from, date_to) or []

    trades = []
    for deal in deals:
        t = deal_to_trade(deal)
        if t:
            trades.append(t)

    # Fetch live positions
    positions = mt5.positions_get()
    live = [position_to_trade(p) for p in positions] if positions else []

    _cached_trades = trades
    _cached_live = live

    # Broadcast to websocket clients
    await broadcast({ "type": "account_update", "account": _account_info })
    await broadcast({ "type": "live_trades", "trades": live })

    return {
        "success": True,
        "message": f"Connected to {req.server}",
        "account": _account_info,
        "trades": sorted(trades, key=lambda x: x["openTime"], reverse=True),
        "live_trades": live,
        "total": len(trades),
    }

@app.get("/api/mt5/sync")
async def sync_mt5():
    """Poll endpoint for HTTP fallback (WebSocket preferred)."""
    global _cached_live, _account_info

    if MT5_AVAILABLE and _connected:
        _account_info = get_account_dict()
        positions = mt5.positions_get()
        live = [position_to_trade(p) for p in positions] if positions else []
        _cached_live = live

        # Check for any newly closed trades since last sync
        last_trade_time = None
        if _cached_trades:
            last_trade_time = max(t["closeTime"] for t in _cached_trades)

        new_trades = []
        if last_trade_time:
            try:
                date_from = datetime.datetime.fromisoformat(last_trade_time.replace("Z","")).replace(tzinfo=datetime.timezone.utc)
                date_to = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=1)
                deals = mt5.history_deals_get(date_from, date_to) or []
                existing_ids = {t["id"] for t in _cached_trades}
                for deal in deals:
                    t = deal_to_trade(deal)
                    if t and t["id"] not in existing_ids:
                        _cached_trades.insert(0, t)
                        new_trades.append(t)
            except Exception as e:
                print(f"Sync new trades error: {e}")
    else:
        live = _cached_live

    return {
        "account": _account_info,
        "live_trades": live,
        "new_trades": new_trades if MT5_AVAILABLE else [],
        "total": len(_cached_trades),
    }

@app.post("/api/mt5/reconnect")
async def reconnect(body: dict):
    """Re-init MT5 connection using saved params (called on page refresh)."""
    global _connected
    if not MT5_AVAILABLE:
        _connected = True
        return { "success": True, "account": _account_info }
    if not _conn_params:
        return { "success": False, "message": "No saved params" }
    # MT5 might already be initialized
    acc = mt5.account_info()
    if acc:
        _account_info.update(get_account_dict())
        _connected = True
        return { "success": True, "account": _account_info }
    return { "success": False, "message": "MT5 not running" }

@app.get("/api/mt5/account")
def get_account():
    return _account_info or { "error": "Not connected" }

@app.post("/api/mt5/disconnect")
async def disconnect():
    global _connected
    _connected = False
    if MT5_AVAILABLE:
        try: mt5.shutdown()
        except: pass
    return { "success": True }

# ── Mock data fallback ─────────────────────────────────────────────────────────
def _generate_mock(count=80):
    import random
    pairs = ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD","AUDUSD","USDCAD","GBPJPY"]
    setups = ["Breakout","Reversal","ICT OB","Trend Follow","VWAP","Range","SMC"]
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    trades = []
    for i in range(count):
        days_ago = random.randint(0, 90)
        open_utc = now - datetime.timedelta(days=days_ago, hours=random.randint(0,16), minutes=random.randint(0,59))
        duration_ms = random.randint(15, 480) * 60 * 1000
        close_utc = open_utc + datetime.timedelta(milliseconds=duration_ms)
        symbol = random.choice(pairs)
        direction = random.choice(["BUY","SELL"])
        pnl = round(random.uniform(-200, 400), 2)
        open_price = round(random.uniform(1.05, 1.55), 5)
        pips = calc_pips(symbol, open_price, open_price + (0.001 if pnl > 0 else -0.001), direction)
        trades.append({
            "id": f"mock_{i}", "ticket": 1000000+i,
            "symbol": symbol, "type": direction,
            "lots": round(random.uniform(0.1,1.0),2),
            "openTime": open_utc.isoformat(),
            "openTimeWIB": open_utc.astimezone(WIB).isoformat(),
            "closeTime": close_utc.isoformat(),
            "closeTimeWIB": close_utc.astimezone(WIB).isoformat(),
            "openPrice": open_price,
            "closePrice": round(open_price + random.uniform(-0.01,0.01),5),
            "sl": round(random.uniform(5,25),1), "tp": round(random.uniform(10,50),1),
            "pnl": pnl, "pips": pips,
            "swap": round(random.uniform(-2,0),2),
            "commission": round(random.uniform(-3,0),2), "rr": round(random.uniform(0.3,3.5),2),
            "session": detect_session(open_utc.hour),
            "setup": random.choice(setups), "emotion": "Neutral",
            "status": "closed",
            "closeType": "target_hit" if pnl>0 else ("stopped_out" if random.random()>0.5 else "manually_closed"),
            "durationMs": duration_ms, "isIntraday": duration_ms < 86400000,
        })
    return sorted(trades, key=lambda x: x["openTime"], reverse=True)

@app.post("/api/candles")
async def get_candles(req: CandlesRequest):
    if not MT5_AVAILABLE or not _connected:
        return {"data": []}
    
    TF_MAP = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1,
        "W1": mt5.TIMEFRAME_W1,
        "MN1": mt5.TIMEFRAME_MN1,
    }

    results = []
    for item in req.items:
        tf = TF_MAP.get(item.timeframe.upper())
        if not tf:
            continue
        try:
            # Get 2 candles
            rates = mt5.copy_rates_from_pos(item.symbol, tf, 0, 2)
            if rates is not None and len(rates) > 0:
                candles = []
                for r in rates:
                    candles.append({
                        "time": int(r['time']),
                        "open": float(r['open']),
                        "high": float(r['high']),
                        "low": float(r['low']),
                        "close": float(r['close']),
                        "tick_volume": int(r['tick_volume'])
                    })
                results.append({
                    "symbol": item.symbol,
                    "timeframe": item.timeframe.upper(),
                    "candles": candles
                })
        except Exception as e:
            print(f"Candle error for {item.symbol}: {e}")
    return {"data": results}

@app.post("/api/ai/analyze")
async def analyze_ai(req: AIAnalyzeRequest):
    if not XAI_AVAILABLE:
        raise HTTPException(status_code=500, detail="xAI (Grok) is not available. Check API key or dependencies.")

    prompt = f"""
Bertindaklah sebagai Ahli Psikologi Trading (Trading Psychologist) dan Manajer Risiko (Risk Manager). Analisis data trading berikut.
ATURAN WAJIB (JANGAN DILANGGAR):
1. DILARANG menggunakan awalan sapaan (seperti "Halo Trader", "Mari kita bedah", dll).
2. DILARANG menggunakan emoji jenis apa pun di dalam teks dan judul.
3. DILARANG menggunakan kata penutup atau ajakan berdiskusi di akhir teks.
4. Gunakan bahasa Indonesia profesional yang lugas. Istilah teknis WAJIB tetap dalam bahasa Inggris dengan terjemahan singkat di dalam kurung, misal: Drawdown (penurunan modal).

Statistik Pengguna:
- Total Trades: {req.totalTrades}
- Win Rate: {req.winRate:.1f}%
- Total Net PnL: ${req.totalPnl:.2f}
- Best Symbol: {req.bestSymbol}
- Worst Symbol: {req.worstSymbol}
- Konteks Kemenangan beruntun (Streaks): {req.recentStreaks}
- Catatan Tambahan (RR, Long/Short): {req.notes}

Tuliskan analisis dengan format Markdown yang rapi. WAJIB cetak tebal (Bold) pada setiap awal paragraf/poin utama agar sangat mudah dibaca.
Gunakan struktur baku berikut tanpa teks tambahan di luar struktur ini:

**Kesimpulan (Performance Verdict):**
[1-2 kalimat ringkas merangkum performa saat ini.]

**Kekuatan & Kelemahan:**
*   **[Nama Kekuatan Utama]:** [Penjelasan ringkas kombinasi teknikal & psikologis]
*   **[Nama Kelemahan Utama]:** [Penjelasan ringkas kombinasi teknikal & psikologis]

**Saran & Evaluasi (Actionable Advice):**
*   **Teknikal:** [1 saran tajam yang dapat langsung dipraktikkan]
*   **Psikologis:** [1 saran tajam tentang manajemen emosi atau mindset]

**Quote Psikologi Trading:**
"[Kutipan asli dari tokoh, WAJIB biarkan dalam bahasa aslinya, misal bahasa Inggris]" — **[Tokoh]**
*Makna:* [1 kalimat penjelasan singkat dalam bahasa Indonesia tentang maksud kutipan tersebut dan mengapa sangat cocok untuk data pengguna saat ini.]
"""
    try:
        response = ai_client.chat.completions.create(
            model="grok-4-1-fast-reasoning",
            messages=[
                {"role": "system", "content": "You are a professional Trading Psychologist and AI Analyst responding in Indonesian."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        insight_text = response.choices[0].message.content
        return {"success": True, "insight": insight_text}
    except Exception as e:
        print(f"xAI API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class NewsAnalysisRequest(BaseModel):
    target_events: list[dict]
    context_events: list[dict]

@app.post("/api/ai/analyze-news")
async def analyze_news_ai(req: NewsAnalysisRequest):
    if not ai_client:
        raise HTTPException(status_code=500, detail="xAI (Grok) is not available. Check API key or dependencies.")

    if not req.target_events:
        return {"success": True, "insight": "Tidak ada berita relevan yang dipilih berdasarkan pengaturan filter Anda pada hari ini."}

    # Format events into readable text
    target_text = "\n".join([
        f"- {e.get('date', '')} ({e.get('country', '')} {e.get('impact', '')}): {e.get('title', '')}. Forecast: {e.get('forecast', '-')}, Previous: {e.get('previous', '-')}"
        for e in req.target_events
    ])

    context_text = "\n".join([
        f"- {e.get('date', '')} ({e.get('country', '')} {e.get('impact', '')}): {e.get('title', '')}. Forecast: {e.get('forecast', '-')}, Previous: {e.get('previous', '-')}"
        for e in req.context_events
    ])

    prompt = f"""
Bertindaklah sebagai Ahli Makroekonomi dan Analis Fundamental Trading (khusus Gold/XAUUSD). Analisis rilis berita ekonomi *Target Hari Ini* dengan mempertimbangkan *Konteks Berita Seminggu Penuh* berikut ini dan berikan prediksi fundamental yang solid.
ATURAN WAJIB (JANGAN DILANGGAR):
1. DILARANG menggunakan awalan sapaan.
2. DILARANG menggunakan emoji jenis apa pun.
3. DILARANG menggunakan kata penutup atau basa-basi.
4. Gunakan bahasa Indonesia profesional yang padat dan lugas.

**Konteks Berita Makro Seminggu Penuh:**
{context_text}

---

**TARGET FOKUS BERITA HARI INI:**
{target_text}

Tuliskan analisis dengan format Markdown yang rapi. WAJIB cetak tebal (Bold) pada setiap awal paragraf/poin utama agar sangat mudah dibaca.
Gunakan struktur baku berikut tanpa teks tambahan:

**Ringkasan Sentimen Makro:**
[1-2 kalimat ringkas merangkum sentimen arah ekonomi secara keseluruhan dari gabungan berita seminggu penuh dengan berita hari ini.]

**Sorotan & Korelasi Data:**
*   **[Tema/Nama Berita Hari Ini Terpenting]:** [Penjelasan ringkas prediksi dampak data target hari ini, dan **BAGAIMANA** ini berkorelasi dengan tren data konteks seminggu penuh.]

**Rekomendasi Eksekusi XAUUSD (Gold):**
*   **Sinyal Inti:** [Pilih HANYA "BUY" atau "SELL", tulis dengan huruf kapital tebal]
*   **Alasan Utama:** [Jelaskan 1-2 kalimat mengapa sentimen dari gabungan berita di hari ini akan memicu arah tersebut. Berikan tebakan probabilitas tertinggi yang harus diambil trader, dilarang memberikan skenario ganda/bersyarat.]
*   **Peringatan Volatilitas:** [1 kalimat tentang risiko volatilitas atau anomali data yang berpotensi membatalkan sinyal ini.]
"""
    try:
        response = ai_client.chat.completions.create(
            model="grok-4-1-fast-reasoning",
            messages=[
                {"role": "system", "content": "You are a professional Fundamental Analyst responding in Indonesian."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=900
        )
        insight_text = response.choices[0].message.content
        return {"success": True, "insight": insight_text}
    except Exception as e:
        print(f"xAI API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("🚀 UltraJournal MT5 Backend v2")
    print(f"📊 MT5: {'Available' if MT5_AVAILABLE else 'Mock mode'}")
    print("🔌 WebSocket: ws://localhost:8000/ws/mt5")
    print("📖 Docs: http://localhost:8000/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

# Force Reload
