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


async def broadcast_to_user(user_id: str, msg: dict):
    dead = []
    for ws in _ws_clients.get(user_id, []):
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients[user_id].remove(ws)


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
    await init_db()
    print("✅ Database initialized")
    yield
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
        select(MT5Connection).where(MT5Connection.user_id == user.id, MT5Connection.is_active == True)
    )
    conn = result.scalar_one_or_none()
    if conn:
        conn.login = req.login
        conn.server = req.server
        conn.encrypted_password = encrypted_pw
        conn.is_active = True
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
        user_id=user.id,
        login=req.login,
        password=req.password,
        server=req.server,
        callback=on_mt5_message,
        interval=10,
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
    await mt5_manager.disconnect(user.id)
    result = await db.execute(
        select(MT5Connection).where(MT5Connection.user_id == user.id, MT5Connection.is_active == True)
    )
    conn = result.scalar_one_or_none()
    if conn:
        conn.is_active = False
        await db.commit()
    return {"success": True}


@app.get("/api/mt5/status")
async def mt5_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    is_connected = mt5_manager.is_connected(user.id)
    
    result = await db.execute(
        select(MT5Connection).where(MT5Connection.user_id == user.id, MT5Connection.is_active == True)
    )
    conn = result.scalar_one_or_none()

    # Auto-reconnect: If worker not running but DB session is active, try starting it
    if not is_connected and conn:
        print(f"DEBUG: Auto-reconnecting MT5 for user {user.id}")
        password = decrypt_connection_password(conn.encrypted_password)
        if password:
            try:
                await mt5_manager.connect(
                    user_id=user.id,
                    login=conn.login,
                    password=password,
                    server=conn.server,
                    callback=on_mt5_message,
                    interval=10,
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


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "version": "3.0", "mt5_available": MT5_AVAILABLE}


if __name__ == "__main__":
    import uvicorn
    print("🚀 TimeJournal MT5 Backend v3")
    print(f"📊 MT5: {'Available' if MT5_AVAILABLE else 'Subprocess worker mode'}")
    print("🔌 WebSocket: ws://localhost:8000/ws/mt5?token=<JWT>")
    print("📖 Docs: http://localhost:8000/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
