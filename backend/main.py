"""
TimeJournal MT5 Backend v3
============================
FastAPI + WebSocket + PostgreSQL + JWT Auth
Per-user MT5 subprocess isolation

Install:
    pip install -r requirements.txt

Run:
    python main.py
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
import datetime
import asyncio
import json
import pytz
import os
import uuid
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from sqlalchemy import delete
import httpx

# Local imports
from database import init_db, get_db, User, MT5Connection, Trade, JournalNote, JournalTag, DailyTag, Alert, UserSettings
from auth import (
    hash_password, verify_password, create_access_token, decode_token, generate_id,
    encrypt_connection_password, decrypt_connection_password
)
from mt5_manager import mt5_manager

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

load_dotenv()

WIB = pytz.timezone("Asia/Jakarta")

# ── xAI (Grok) ───────────────────────────────────────────────────────────────
try:
    from openai import OpenAI
    _api_key = os.getenv("XAI_API_KEY")
    if _api_key:
        ai_client = OpenAI(api_key=_api_key, base_url="https://api.x.ai/v1")
        XAI_AVAILABLE = True
        print("✅ xAI (Grok) loaded")
    else:
        ai_client = None
        XAI_AVAILABLE = False
        print("⚠ XAI_API_KEY not set")
except ImportError:
    ai_client = None
    XAI_AVAILABLE = False

# ── MT5 (Windows only) ───────────────────────────────────────────────────────
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
    print("✅ MetaTrader5 library loaded")
except ImportError:
    MT5_AVAILABLE = False
    print("⚠ MetaTrader5 not available. Using subprocess worker mode.")

# ── WebSocket client registry {user_id: [WebSocket]} ─────────────────────────
_ws_clients: Dict[str, List[WebSocket]] = {}

# ── Price & Candle cache (updated by MT5 bridge push) ─────────────────────────
_price_cache: Dict[str, float] = {}  # {"XAUUSD": 2650.50, ...}
_candle_cache: Dict[str, list] = {}  # {"XAUUSD_M1": [{time, open, high, low, close}, ...], ...}
_alert_notified: Dict[str, float] = {}  # {"alert_id": last_notified_timestamp}

# ── News cache (updated hourly) ───────────────────────────────────────────────
_news_cache: List[dict] = []
_news_notified: Set[str] = set()


async def broadcast_to_user(user_id: str, msg: dict):
    dead = []
    for ws in _ws_clients.get(user_id, []):
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients[user_id].remove(ws)

async def send_expo_push_notification(token: str, title: str, body: str, data: dict = None):
    """Sends a push notification using Expo's push API."""
    if not token or not token.startswith("ExponentPushToken"):
        return
    
    message = {
        "to": token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=message,
                headers={"Accept": "application/json", "Accept-encoding": "gzip, deflate", "Content-Type": "application/json"}
            )
            print(f"DEBUG PUSH: Sent notification to {token}: {response.json()}")
    except Exception as e:
        print(f"DEBUG PUSH: Error sending push notification: {e}")


# ── MT5 worker callback ───────────────────────────────────────────────────────
async def on_mt5_message(user_id: str, msg: dict):
    """Called by MT5WorkerProcess when data arrives. Saves to DB and broadcasts."""
    msg_type = msg.get("type")
    print(f"DEBUG MT5: Received {msg_type} for user {user_id}")

    if msg_type in ("all_trades", "history_batch"):
        # Bulk upsert trades to DB
        async with AsyncSessionLocal() as db:
            trades = msg.get("trades", [])
            for t in trades:
                existing = await db.get(Trade, t["id"])
                if existing:
                    existing.data = t
                    existing.synced_at = datetime.datetime.utcnow()
                else:
                    db.add(Trade(id=t["id"], user_id=user_id, data=t))
            await db.commit()
        await broadcast_to_user(user_id, msg)

    elif msg_type == "new_trade":
        async with AsyncSessionLocal() as db:
            t = msg["trade"]
            existing = await db.get(Trade, t["id"])
            if not existing:
                db.add(Trade(id=t["id"], user_id=user_id, data=t))
                await db.commit()
                
                # Check for push notification token and send alert
                settings = await db.get(UserSettings, user_id)
                if settings and settings.expo_push_token:
                    sym = t.get("symbol", "Unknown")
                    side = t.get("type", "TRADE")
                    lots = t.get("lots", t.get("volume", 0))
                    status = t.get("status", "live")
                    
                    if status.lower() == "closed":
                        pnl = t.get("pnl", t.get("profit", 0.0))
                        title = f"Trade Closed: {sym}"
                        body = f"{side} {lots} closed. PnL: ${pnl:.2f}"
                    else:
                        title = f"Trade Opened: {sym}"
                        body = f"{side} {lots} opened at {t.get('openPrice', t.get('open_price', 0))}."
                    
                    asyncio.create_task(send_expo_push_notification(settings.expo_push_token, title, body, t))
                            
        await broadcast_to_user(user_id, msg)

    elif msg_type in ("live_trades", "account_update", "error", "connected"):
        # Account info update — also persist to mt5_connections
        if msg_type == "account_update":
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(MT5Connection).where(
                        MT5Connection.user_id == user_id,
                        MT5Connection.is_active == True
                    )
                )
                conn = result.scalar_one_or_none()
                if conn:
                    conn.account_info = msg.get("account", {})
                    conn.last_sync = datetime.datetime.utcnow()
                    await db.commit()
        await broadcast_to_user(user_id, msg)


# Lazy import for session
from database import AsyncSessionLocal

# ── App lifespan ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from database import DATABASE_URL
    # Mask password for security
    masked_url = DATABASE_URL
    if "@" in DATABASE_URL:
        base, rest = DATABASE_URL.split("@", 1)
        if ":" in base:
            proto, creds = base.split("://", 1)
            masked_url = f"{proto}://***:***@{rest}"
    
    print(f"📡 Connecting to database: {masked_url}")
    try:
        await asyncio.wait_for(init_db(), timeout=20.0)
        print("✅ Database initialized successfully")
    except asyncio.TimeoutError:
        print("❌ Database initialization TIMEOUT (check your PostgreSQL connectivity)")
    except Exception as e:
        print(f"❌ Database initialization FAILED: {e}")
    
    # Start alert evaluator background task
    evaluator_task = asyncio.create_task(_alert_evaluator_loop())
    print("🔔 Alert evaluator started")
    
    # Start news evaluator background task
    news_task = asyncio.create_task(_news_evaluator_loop())
    print("📰 News evaluator started")
    
    yield
    
    evaluator_task.cancel()
    news_task.cancel()
    await mt5_manager.shutdown_all()


app = FastAPI(title="TimeJournal MT5 API v3", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


# ── Auth helpers ──────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        print("DEBUG AUTH: No credentials found in request")
        raise HTTPException(status_code=401, detail="Not authenticated")
    print(f"DEBUG AUTH: Token found: {credentials.credentials[:10]}...")
    payload = decode_token(credentials.credentials)
    if not payload:
        print("DEBUG AUTH: Token decoding failed")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        print("DEBUG AUTH: No sub in payload")
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = await db.get(User, user_id)
    if not user:
        print(f"DEBUG AUTH: User {user_id} not found in DB")
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return user_id


# ── Auth Models ───────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str


# ── Auth Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Nama tidak boleh kosong")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password minimal 6 karakter")

    key = req.email.lower().strip()
    result = await db.execute(select(User).where(User.email == key))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email sudah terdaftar. Silakan login.")

    user = User(
        id=generate_id(),
        email=key,
        name=req.name.strip(),
        hashed_password=hash_password(req.password),
        created_at=datetime.datetime.utcnow(),
    )
    # Default settings
    settings = UserSettings(
        user_id=user.id,
        theme="light",
        news_settings={
            "enabled": False, "currencies": ["USD"],
            "impacts": ["High"], "minutesBefore": 5
        }
    )
    # Default journal tags
    default_tags = ["Followed Plan", "FOMO", "Revenge Trading", "Impatient", "Good Setup", "News Event"]
    tag_rows = [JournalTag(user_id=user.id, name=t) for t in default_tags]

    db.add(user)
    db.add(settings)
    for t in tag_rows:
        db.add(t)
    await db.commit()

    token = create_access_token({"sub": user.id})
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "name": user.name, "createdAt": user.created_at.isoformat()},
    }


@app.post("/api/auth/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    key = req.email.lower().strip()
    result = await db.execute(select(User).where(User.email == key))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email atau password salah")

    token = create_access_token({"sub": user.id})
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "name": user.name, "createdAt": user.created_at.isoformat()},
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "time": datetime.datetime.now(tz=WIB).isoformat()}

@app.get("/api/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "name": user.name, "createdAt": user.created_at.isoformat()}


# ── MT5 Models ────────────────────────────────────────────────────────────────
class ConnectRequest(BaseModel):
    login: int
    password: str
    server: str
    port: int = 443


# ── MT5 Endpoint: Connect (per user) ─────────────────────────────────────────
@app.post("/api/mt5/connect")
async def connect_mt5(
    req: ConnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Encrypt password for DB storage
    encrypted_pw = encrypt_connection_password(req.password)

    # Save/update connection in DB
    result = await db.execute(
        select(MT5Connection).where(MT5Connection.user_id == user.id)
    )
    all_conns = result.scalars().all()
    
    # ── Safely deactivate all old, detect if login changed ──────────
    login_changed = False
    same_login_conn = None
    
    for c in all_conns:
        if c.is_active and c.login != req.login:
            login_changed = True
        if c.login == req.login and c.server == req.server:
            same_login_conn = c
        c.is_active = False
        
    if not same_login_conn and all_conns:
        login_changed = True

    if login_changed:
        print(f"DEBUG MT5: Login changed to {req.login}, clearing old trades")
        await db.execute(delete(Trade).where(Trade.user_id == user.id))

    if same_login_conn:
        same_login_conn.login = req.login
        same_login_conn.server = req.server
        same_login_conn.encrypted_password = encrypted_pw
        same_login_conn.is_active = True
    else:
        conn = MT5Connection(
            user_id=user.id,
            login=req.login,
            server=req.server,
            encrypted_password=encrypted_pw,
            is_active=True,
        )
        db.add(conn)
    await db.commit()

    print(f"DEBUG MT5: Starting worker for {user.id}, login {req.login}")
    # Start MT5 worker subprocess for this user
    await mt5_manager.connect(
        user_id=str(user.id),
        login=req.login,
        password=req.password,
        server=req.server,
        on_data=on_mt5_message,
    )
    print(f"DEBUG MT5: Worker started for {user.id}")

    # Return cached trades from DB immediately (worker will populate async)
    result = await db.execute(select(Trade).where(Trade.user_id == user.id))
    cached_trades = [r.data for r in result.scalars().all()]

    return {
        "success": True,
        "message": f"Connecting to {req.server}... MT5 worker started.",
        "trades": sorted(cached_trades, key=lambda x: x.get("openTime", ""), reverse=True),
        "live_trades": [],
        "total": len(cached_trades),
    }


@app.post("/api/mt5/disconnect")
async def disconnect_mt5(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await mt5_manager.disconnect(str(user.id))
    
    # Clear active status flag for all existing connections
    result = await db.execute(
        select(MT5Connection).where(MT5Connection.user_id == user.id, MT5Connection.is_active == True)
    )
    active_conns = result.scalars().all()
    for conn in active_conns:
        conn.is_active = False
        
    # Wipe trade cache for this user so old data doesn't persist to UI
    await db.execute(delete(Trade).where(Trade.user_id == user.id))
    await db.commit()
    
    return {"success": True}


# ── Push Architecture Endpoints ───────────────────────────────────────────────

BRIDGE_KEY = os.getenv("MT5_BRIDGE_API_KEY", "changeme_secret_key_123")

def verify_bridge_key(x_bridge_key: str = Header(default="")):
    if x_bridge_key != BRIDGE_KEY:
        raise HTTPException(status_code=401, detail="Invalid bridge key")

@app.get("/api/mt5/pending-connections")
async def get_pending_connections(
    x_bridge_key: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by MT5 Bridge on Windows.
    Returns list of active MT5 sessions so bridge knows which users to serve.
    """
    if x_bridge_key != BRIDGE_KEY:
        raise HTTPException(status_code=401, detail="Invalid bridge key")

    result = await db.execute(
        select(MT5Connection).where(MT5Connection.is_active == True)
    )
    active_conns = result.scalars().all()
    connections = []
    for c in active_conns:
        password = decrypt_connection_password(c.encrypted_password)
        if password:
            connections.append({
                "user_id": c.user_id,
                "login": c.login,
                "server": c.server,
                "password": password,
            })
    return {"connections": connections}


class MT5PushPayload(BaseModel):
    user_id: str
    type: str               # "connected" | "all_trades" | "live_trades" | "account_update" | "error"
    trades: list = []
    account: dict = {}
    message: str = ""

@app.post("/api/mt5/push")
async def receive_mt5_push(
    payload: MT5PushPayload,
    x_bridge_key: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by MT5 Bridge on Windows.
    Receives pushed trade/position/account data and broadcasts to user WebSockets.
    """
    if x_bridge_key != BRIDGE_KEY:
        raise HTTPException(status_code=401, detail="Invalid bridge key")

    # Cache latest prices from live trades
    for trade in payload.trades:
        symbol = trade.get("symbol")
        price = trade.get("priceCurrent") or trade.get("currentPrice")
        if symbol and price:
            _price_cache[symbol] = float(price)

    msg = {
        "type": payload.type,
        "trades": payload.trades,
        "account": payload.account,
        "message": payload.message,
    }
    # Re-use existing on_mt5_message handler — same as pull model
    await on_mt5_message(payload.user_id, msg)
    return {"ok": True}


# ── Push Prices/Candles from Bridge ───────────────────────────────────────────
class PricePushPayload(BaseModel):
    prices: Dict[str, float] = {}  # {"XAUUSD": 2650.50}
    candles: Dict[str, list] = {}  # {"XAUUSD_M1": [{time,open,high,low,close}]}

@app.post("/api/mt5/push-prices")
async def receive_price_push(
    payload: PricePushPayload,
    x_bridge_key: str = Header(default=""),
):
    """Receives latest prices and candle data from MT5 Bridge."""
    if x_bridge_key != BRIDGE_KEY:
        raise HTTPException(status_code=401, detail="Invalid bridge key")
    
    _price_cache.update(payload.prices)
    _candle_cache.update(payload.candles)
    return {"ok": True, "cached_symbols": len(_price_cache)}


# ── Push Token Endpoint ───────────────────────────────────────────────────────
class PushTokenRequest(BaseModel):
    token: str

@app.post("/api/push-token")
async def register_push_token(
    req: PushTokenRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register Expo push token for the current user."""
    s = await db.get(UserSettings, user.id)
    if not s:
        s = UserSettings(user_id=user.id, theme="light", news_settings={})
        db.add(s)
    s.expo_push_token = req.token
    s.updated_at = datetime.datetime.utcnow()
    await db.commit()
    print(f"🔔 Push token registered for user {user.id}: {req.token[:30]}...")
    return {"ok": True}




@app.get("/api/mt5/status")
async def mt5_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    is_connected = mt5_manager.is_connected(str(user.id))
    
    result = await db.execute(
        select(MT5Connection).where(MT5Connection.user_id == user.id, MT5Connection.is_active == True)
    )
    # Support if there were dupes previously
    active_conns = result.scalars().all()
    conn = active_conns[0] if active_conns else None

    # Auto-reconnect: If worker not running but DB session is active, try starting it
    if not is_connected and conn:
        print(f"DEBUG: Auto-reconnecting MT5 for user {user.id}")
        password = decrypt_connection_password(conn.encrypted_password)
        if password:
            try:
                await mt5_manager.connect(
                    user_id=str(user.id),
                    login=conn.login,
                    password=password,
                    server=conn.server,
                    on_data=on_mt5_message,
                )
                is_connected = True
            except Exception as e:
                print(f"DEBUG: Auto-reconnect failed for {user.id}: {e}")

    return {
        "connected": is_connected,
        "account": conn.account_info if conn else None,
        "lastSync": conn.last_sync.isoformat() if conn and conn.last_sync else None,
        "login": conn.login if conn else None,
        "server": conn.server if conn else None,
    }

@app.get("/api/mt5/alert-symbols")
async def get_alert_symbols(
    x_bridge_key: str = Header(default=""),
    db: AsyncSession = Depends(get_db)
):
    """Returns a list of symbols that have active price/candle alerts so the bridge can track them."""
    if x_bridge_key != BRIDGE_KEY:
        raise HTTPException(status_code=401, detail="Invalid bridge key")
    
    result = await db.execute(select(Alert).where(Alert.enabled == True))
    alerts = result.scalars().all()
    
    symbols = set()
    for a in alerts:
        sym = a.data.get("symbol")
        if sym: symbols.add(sym)
        
    return {"symbols": list(symbols)}


@app.get("/api/mt5/trades")
async def get_trades(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.user_id == user.id))
    trades = [r.data for r in result.scalars().all()]
    return {"trades": sorted(trades, key=lambda x: x.get("openTime", ""), reverse=True), "total": len(trades)}


# ── Candles (proxy to MT5 worker — only on Windows) ──────────────────────────
class CandleRequestItem(BaseModel):
    symbol: str
    timeframe: str

class CandlesRequest(BaseModel):
    items: List[CandleRequestItem]

@app.post("/api/candles")
async def get_candles(req: CandlesRequest, user: User = Depends(get_current_user)):
    if not MT5_AVAILABLE or not mt5_manager.is_connected(user.id):
        return {"data": []}
    # On Windows: direct MT5 call (candle data is per-symbol, not per-user sensitive)
    TF_MAP = {
        "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30, "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1, "MN1": mt5.TIMEFRAME_MN1,
    }
    results = []
    for item in req.items:
        tf = TF_MAP.get(item.timeframe.upper())
        if not tf:
            continue
        try:
            rates = mt5.copy_rates_from_pos(item.symbol, tf, 0, 2)
            if rates is not None and len(rates) > 0:
                results.append({
                    "symbol": item.symbol, "timeframe": item.timeframe.upper(),
                    "candles": [{"time": int(r["time"]), "open": float(r["open"]), "high": float(r["high"]),
                                  "low": float(r["low"]), "close": float(r["close"]), "tick_volume": int(r["tick_volume"])}
                                for r in rates],
                })
        except Exception as e:
            print(f"Candle error for {item.symbol}: {e}")
    return {"data": results}


# ── WebSocket (per-user) ──────────────────────────────────────────────────────
@app.websocket("/ws/mt5")
async def ws_mt5(ws: WebSocket):
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001)
        return
    payload = decode_token(token)
    if not payload:
        await ws.close(code=4001)
        return
    user_id = payload.get("sub")
    if not user_id:
        await ws.close(code=4001)
        return

    await ws.accept()
    if user_id not in _ws_clients:
        _ws_clients[user_id] = []
    _ws_clients[user_id].append(ws)

    try:
        while True:
            await ws.receive_text()  # keep-alive ping
    except WebSocketDisconnect:
        if user_id in _ws_clients and ws in _ws_clients[user_id]:
            _ws_clients[user_id].remove(ws)


# ── Journal Endpoints ─────────────────────────────────────────────────────────
@app.get("/api/journal")
async def get_journal(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    notes_result = await db.execute(select(JournalNote).where(JournalNote.user_id == user.id))
    notes = {n.day: n.text for n in notes_result.scalars().all()}

    tags_result = await db.execute(select(JournalTag).where(JournalTag.user_id == user.id))
    tags = [t.name for t in tags_result.scalars().all()]

    dtags_result = await db.execute(select(DailyTag).where(DailyTag.user_id == user.id))
    daily_tags: Dict[str, List[str]] = {}
    for dt in dtags_result.scalars().all():
        daily_tags.setdefault(dt.day, []).append(dt.tag)

    return {"notes": notes, "tags": tags, "dailyTags": daily_tags}


class NoteRequest(BaseModel):
    day: str  # "YYYY-MM-DD"
    text: str

@app.post("/api/journal/note")
async def save_note(req: NoteRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JournalNote).where(JournalNote.user_id == user.id, JournalNote.day == req.day)
    )
    note = result.scalar_one_or_none()
    if note:
        note.text = req.text
        note.updated_at = datetime.datetime.utcnow()
    else:
        db.add(JournalNote(user_id=user.id, day=req.day, text=req.text))
    await db.commit()
    return {"ok": True}


class TagToggleRequest(BaseModel):
    day: str
    tag: str

@app.post("/api/journal/daily-tag/toggle")
async def toggle_daily_tag(req: TagToggleRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DailyTag).where(DailyTag.user_id == user.id, DailyTag.day == req.day, DailyTag.tag == req.tag)
    )
    dt = result.scalar_one_or_none()
    if dt:
        await db.delete(dt)
    else:
        db.add(DailyTag(user_id=user.id, day=req.day, tag=req.tag))
    await db.commit()
    return {"ok": True}


class AddTagRequest(BaseModel):
    name: str

@app.post("/api/journal/tag")
async def add_tag(req: AddTagRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JournalTag).where(JournalTag.user_id == user.id, JournalTag.name == req.name)
    )
    if not result.scalar_one_or_none():
        db.add(JournalTag(user_id=user.id, name=req.name))
        await db.commit()
    return {"ok": True}


class DeleteTagRequest(BaseModel):
    name: str

@app.delete("/api/journal/tag")
async def delete_tag(req: DeleteTagRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        delete(JournalTag).where(JournalTag.user_id == user.id, JournalTag.name == req.name)
    )
    await db.commit()
    return {"ok": True}


# ── Alerts Endpoints ──────────────────────────────────────────────────────────
@app.get("/api/alerts")
async def get_alerts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.user_id == user.id))
    alerts = [a.data for a in result.scalars().all()]
    return {"alerts": alerts}


class AlertRequest(BaseModel):
    data: dict

@app.post("/api/alerts")
async def create_alert(req: AlertRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert_id = str(uuid.uuid4())[:7]
    alert_data = {**req.data, "id": alert_id}
    db.add(Alert(id=alert_id, user_id=user.id, data=alert_data))
    await db.commit()
    return {"ok": True, "id": alert_id, "alert": alert_data}


class AlertUpdateRequest(BaseModel):
    partial: dict

@app.put("/api/alerts/{alert_id}")
async def update_alert(alert_id: str, req: AlertUpdateRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id, Alert.user_id == user.id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.data = {**alert.data, **req.partial}
    await db.commit()
    return {"ok": True, "alert": alert.data}


@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Alert).where(Alert.id == alert_id, Alert.user_id == user.id))
    await db.commit()
    return {"ok": True}


# ── Settings Endpoints ────────────────────────────────────────────────────────
@app.get("/api/settings")
async def get_settings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await db.get(UserSettings, user.id)
    if not s:
        return {"theme": "light", "newsSettings": {"enabled": False, "currencies": ["USD"], "impacts": ["High"], "minutesBefore": 5}}
    return {"theme": s.theme, "newsSettings": s.news_settings}


class SettingsUpdateRequest(BaseModel):
    theme: Optional[str] = None
    newsSettings: Optional[dict] = None
    expo_push_token: Optional[str] = None

@app.put("/api/settings")
async def update_settings(req: SettingsUpdateRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await db.get(UserSettings, user.id)
    if not s:
        s = UserSettings(user_id=user.id, theme="light", news_settings={})
        db.add(s)
    if req.theme is not None:
        s.theme = req.theme
    if req.newsSettings is not None:
        s.news_settings = req.newsSettings
    if req.expo_push_token is not None:
        s.expo_push_token = req.expo_push_token
    s.updated_at = datetime.datetime.utcnow()
    await db.commit()
    return {"ok": True}


# ── AI Endpoints ──────────────────────────────────────────────────────────────
class AIAnalyzeRequest(BaseModel):
    totalTrades: int
    winRate: float
    totalPnl: float
    bestSymbol: str
    worstSymbol: str
    recentStreaks: str = ""
    notes: str = ""

@app.post("/api/ai/analyze")
async def analyze_ai(req: AIAnalyzeRequest, user: User = Depends(get_current_user)):
    if not XAI_AVAILABLE:
        raise HTTPException(status_code=500, detail="xAI (Grok) tidak tersedia. Periksa API key.")
    prompt = f"""Bertindaklah sebagai Ahli Psikologi Trading dan Manajer Risiko. Analisis data trading berikut.
ATURAN WAJIB:
1. DILARANG menggunakan awalan sapaan.
2. DILARANG menggunakan emoji.
3. DILARANG menggunakan kata penutup.
4. Gunakan bahasa Indonesia profesional. Istilah teknis tetap bahasa Inggris dengan terjemahan singkat di dalam kurung.

Statistik Pengguna:
- Total Trades: {req.totalTrades}
- Win Rate: {req.winRate:.1f}%
- Total Net PnL: ${req.totalPnl:.2f}
- Best Symbol: {req.bestSymbol}
- Worst Symbol: {req.worstSymbol}
- Streaks: {req.recentStreaks}
- Catatan: {req.notes}

Format Markdown rapi. Bold setiap awal paragraf/poin utama.
Struktur:
**Kesimpulan (Performance Verdict):** [1-2 kalimat]
**Kekuatan & Kelemahan:** [poin-poin]
**Saran & Evaluasi (Actionable Advice):** [Teknikal & Psikologis]
**Quote Psikologi Trading:** [kutipan + makna]"""
    try:
        response = ai_client.chat.completions.create(
            model="grok-4-1-fast-reasoning",
            messages=[
                {"role": "system", "content": "You are a professional Trading Psychologist responding in Indonesian."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7, max_tokens=1000
        )
        return {"success": True, "insight": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class NewsAnalysisRequest(BaseModel):
    target_events: list[dict]
    context_events: list[dict]

@app.post("/api/ai/analyze-news")
async def analyze_news_ai(req: NewsAnalysisRequest, user: User = Depends(get_current_user)):
    if not XAI_AVAILABLE:
        raise HTTPException(status_code=500, detail="xAI tidak tersedia.")
    if not req.target_events:
        return {"success": True, "insight": "Tidak ada berita relevan yang dipilih berdasarkan filter Anda hari ini."}
    target_text = "\n".join([
        f"- {e.get('date','')} ({e.get('country','')} {e.get('impact','')}): {e.get('title','')}. Forecast: {e.get('forecast','-')}, Previous: {e.get('previous','-')}"
        for e in req.target_events
    ])
    context_text = "\n".join([
        f"- {e.get('date','')} ({e.get('country','')} {e.get('impact','')}): {e.get('title','')}. Forecast: {e.get('forecast','-')}, Previous: {e.get('previous','-')}"
        for e in req.context_events
    ])
    prompt = f"""Bertindaklah sebagai Ahli Makroekonomi dan Analis Fundamental Trading (Gold/XAUUSD).
ATURAN: Tanpa sapaan, tanpa emoji, tanpa basa-basi. Bahasa Indonesia profesional.

**Konteks Makro Seminggu:**
{context_text}

**TARGET HARI INI:**
{target_text}

Format Markdown. Bold setiap poin utama. Struktur:
**Ringkasan Sentimen Makro:** [1-2 kalimat]
**Sorotan & Korelasi Data:** [poin-poin]
**Rekomendasi Eksekusi XAUUSD (Gold):**
- **Sinyal Inti:** [BUY atau SELL]
- **Alasan Utama:** [1-2 kalimat]
- **Peringatan Volatilitas:** [1 kalimat]"""
    try:
        response = ai_client.chat.completions.create(
            model="grok-4-1-fast-reasoning",
            messages=[
                {"role": "system", "content": "You are a professional Fundamental Analyst responding in Indonesian."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7, max_tokens=900
        )
        return {"success": True, "insight": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Alert Evaluator Background Loop ──────────────────────────────────────────
async def _alert_evaluator_loop():
    """Runs every 5 seconds. Evaluates alerts against cached prices and sends push notifications."""
    COOLDOWN_SECONDS = 60  # Don't re-notify same alert within 60s
    await asyncio.sleep(10)  # Wait for DB init
    print("🔔 Alert evaluator loop running")
    
    while True:
        try:
            if _price_cache:  # Only evaluate if we have price data
                async with AsyncSessionLocal() as db:
                    # Fetch all users with alerts and push tokens
                    result = await db.execute(
                        select(User).options(
                            selectinload(User.alerts),
                            selectinload(User.settings)
                        )
                    )
                    users = result.scalars().all()
                    
                    now = asyncio.get_event_loop().time()
                    
                    for user in users:
                        if not user.settings or not user.settings.expo_push_token:
                            continue
                        push_token = user.settings.expo_push_token
                        
                        for alert_row in user.alerts:
                            alert = alert_row.data
                            if not alert.get("enabled", True):
                                continue
                            
                            alert_id = alert_row.id
                            
                            # Cooldown check
                            last_notified = _alert_notified.get(alert_id, 0)
                            if now - last_notified < COOLDOWN_SECONDS:
                                continue
                            
                            symbol = alert.get("symbol", "")
                            alert_type = alert.get("type", "")
                            
                            triggered = False
                            title = ""
                            body = ""
                            
                            if alert_type == "price" and symbol in _price_cache:
                                current_price = _price_cache[symbol]
                                target = alert.get("targetPrice", 0)
                                trigger = alert.get("trigger", "")
                                
                                if trigger == "Above" and current_price >= target:
                                    triggered = True
                                    title = f"🎯 {symbol} Price Target!"
                                    body = f"{symbol} reached above {target}! Current: {current_price}"
                                elif trigger == "Below" and current_price <= target:
                                    triggered = True
                                    title = f"🎯 {symbol} Price Target!"
                                    body = f"{symbol} dropped below {target}! Current: {current_price}"
                                elif trigger == "Crosses" and abs(current_price - target) / target < 0.001:
                                    triggered = True
                                    title = f"🎯 {symbol} Price Target!"
                                    body = f"{symbol} crossed target {target}! Current: {current_price}"
                                
                                if alert.get("notes"):
                                    body += f"\nNote: {alert['notes']}"
                            
                            elif alert_type == "candle":
                                tf = alert.get("timeframe", "M1")
                                cache_key = f"{symbol}_{tf}"
                                candles = _candle_cache.get(cache_key, [])
                                
                                if len(candles) >= 2:
                                    c = candles[-1]  # Current candle
                                    close_val = c.get("close", 0)
                                    open_val = c.get("open", 0)
                                    high_val = c.get("high", 0)
                                    low_val = c.get("low", 0)
                                    
                                    body_size = abs(close_val - open_val)
                                    wick = (high_val - low_val) - body_size
                                    wick_pct = (wick / (high_val - low_val) * 100) if (high_val - low_val) > 0 else 100
                                    
                                    # Calculate pips
                                    pip_size = 0.01 if "JPY" in symbol.upper() else 0.0001
                                    if any(x in symbol.upper() for x in ["XAU", "GOLD"]): pip_size = 0.1
                                    body_pips = body_size / pip_size
                                    
                                    min_body = alert.get("minBodyPips", 0)
                                    max_wick = alert.get("maxWickPercent", 100)
                                    
                                    if body_pips >= min_body and wick_pct <= max_wick:
                                        direction = "Bullish" if close_val > open_val else "Bearish"
                                        triggered = True
                                        title = f"🚨 {symbol} {tf} Momentum!"
                                        body = f"{direction} candle with {body_pips:.1f} pips body and {wick_pct:.0f}% wick!"
                            
                            if triggered:
                                _alert_notified[alert_id] = now
                                await send_expo_push_notification(
                                    push_token, title, body,
                                    {"alertId": alert_id, "symbol": symbol}
                                )
                                
                                # Disable "Once" alerts
                                if alert.get("frequency") == "Once":
                                    alert["enabled"] = False
                                    alert_row.data = alert
                                    from sqlalchemy.orm.attributes import flag_modified
                                    flag_modified(alert_row, "data")
                                    await db.commit()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"⚠ Alert evaluator error: {e}")
        
        await asyncio.sleep(5)


# ── News Evaluator Background Loop ───────────────────────────────────────────
async def _update_news_cache():
    """Fetches the latest news JSON every hour."""
    global _news_cache
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get("https://nfs.faireconomy.media/ff_calendar_thisweek.json", headers={"User-Agent": "Mozilla/5.0"})
            if res.status_code == 200:
                _news_cache = res.json()
    except Exception as e:
        print(f"⚠ Failed to fetch news for cache: {e}")

async def _news_evaluator_loop():
    """Runs every 1 minute. Evaluates news events against user settings and pushes notifications."""
    await asyncio.sleep(15)  # Wait for DB init
    print("📰 News evaluator loop running")
    
    last_fetch = 0
    
    while True:
        try:
            now_ts = time.time()
            if now_ts - last_fetch > 3600:  # Refresh every hour
                await _update_news_cache()
                last_fetch = now_ts
                
            if _news_cache:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(User).options(selectinload(User.settings))
                    )
                    users = result.scalars().all()
                    
                    now_dt = datetime.datetime.now(datetime.timezone.utc)
                    
                    # Maintenance: clear old notified tracking once a day
                    if len(_news_notified) > 1000:
                        _news_notified.clear()
                    
                    for user in users:
                        if not user.settings or not user.settings.expo_push_token:
                            continue
                        
                        settings = user.settings.news_settings or {}
                        if not settings.get("enabled", False):
                            continue
                            
                        push_token = user.settings.expo_push_token
                        currencies = settings.get("currencies", [])
                        impacts = settings.get("impacts", [])
                        minutes_before = settings.get("minutesBefore", 5)
                        
                        threshold_dt = now_dt + datetime.timedelta(minutes=minutes_before)
                        
                        for ev in _news_cache:
                            country = ev.get("country", "")
                            impact = ev.get("impact", "")
                            
                            if country not in currencies or impact not in impacts:
                                continue
                                
                            ev_date_str = ev.get("date", "")
                            if not ev_date_str: continue
                            
                            try:
                                # Forexfactory API returns ISO-like strings, usually parseable
                                ev_dt = datetime.datetime.fromisoformat(ev_date_str.replace("Z", "+00:00"))
                                if ev_dt.tzinfo is None:
                                    ev_dt = ev_dt.replace(tzinfo=datetime.timezone.utc)
                            except:
                                continue
                            
                            # If event is within the timeframe window
                            if now_dt < ev_dt <= threshold_dt:
                                title = ev.get("title", "Berita Ekonomi")
                                ev_id = f"{user.id}_{title}_{ev_date_str}"
                                
                                if ev_id not in _news_notified:
                                    _news_notified.add(ev_id)
                                    forecast = ev.get("forecast", "-")
                                    prev = ev.get("previous", "-")
                                    
                                    await send_expo_push_notification(
                                        push_token,
                                        f"📰 {country} {impact} Impact",
                                        f"{title} rilis dalam {minutes_before} menit.\nForecast: {forecast} | Prev: {prev}",
                                        {"type": "news", "country": country, "impact": impact}
                                    )
                                    
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"⚠ News evaluator error: {e}")
            
        await asyncio.sleep(60)  # Check every minute


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/api/health")
@app.head("/api/health")
def health_check():
    return {"status": "ok", "version": "3.0", "cached_prices": len(_price_cache)}


@app.get("/")
@app.head("/")
def root():
    return {"status": "ok", "version": "3.0"}


if __name__ == "__main__":
    import uvicorn
    print("🚀 TimeJournal MT5 Backend v3")
    print(f"📊 MT5: {'Available' if MT5_AVAILABLE else 'Subprocess worker mode'}")
    print("🔌 WebSocket: ws://localhost:8000/ws/mt5?token=<JWT>")
    print("📖 Docs: http://localhost:8000/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
