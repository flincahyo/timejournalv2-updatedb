"""
backend/mt5_manager.py
Per-user MT5 manager via HTTP bridge (Windows MT5 Bridge Server).

Architecture:
  - MT5BridgeManager: singleton that manages {user_id -> MT5BridgeWorker}
  - MT5BridgeWorker: polls the Windows MT5 Bridge HTTP server periodically,
    calls registered callbacks to broadcast data to user's WebSocket connections.

Why HTTP bridge instead of Wine subprocess?
  The Windows MT5 Bridge server runs natively on Windows with MetaTrader5,
  bypassing all Linux/Wine compatibility issues. The bridge exposes a REST API
  that this manager polls every N seconds.
"""

import asyncio
import logging
import os
from typing import Callable, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Bridge config from environment ───────────────────────────────────────────
BRIDGE_URL = os.getenv("MT5_BRIDGE_URL", "http://localhost:8765").rstrip("/")
BRIDGE_API_KEY = os.getenv("MT5_BRIDGE_API_KEY", "changeme_secret_key_123")
POLL_INTERVAL = int(os.getenv("MT5_POLL_INTERVAL", "10"))  # seconds


def _bridge_headers() -> dict:
    return {"x-api-key": BRIDGE_API_KEY, "Content-Type": "application/json"}


# ── Single worker per user ────────────────────────────────────────────────────
class MT5BridgeWorker:
    def __init__(
        self,
        user_id: str,
        login: int,
        password: str,
        server: str,
        interval: int = POLL_INTERVAL,
        on_data: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
    ):
        self.user_id = user_id
        self.login = login
        self.password = password
        self.server = server
        self.interval = interval
        self.on_data = on_data
        self.on_error = on_error

        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._connected = False
        self._account_info: dict = {}

    async def start(self):
        """Connect to MT5 via bridge and start polling loop."""
        logger.info(f"MT5BridgeWorker starting for user {self.user_id} via {BRIDGE_URL}")

        # Step 1: Connect
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{BRIDGE_URL}/connect",
                    json={
                        "user_id": self.user_id,
                        "login": self.login,
                        "password": self.password,
                        "server": self.server,
                    },
                    headers=_bridge_headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                self._account_info = data.get("account", {})
                self._connected = True
                logger.info(f"MT5 connected for user {self.user_id}: {self._account_info}")

                if self.on_data:
                    await self.on_data({
                        "type": "connected",
                        "account": self._account_info,
                    })
        except Exception as e:
            logger.error(f"MT5 bridge connect failed for user {self.user_id}: {e}")
            if self.on_error:
                await self.on_error(str(e))
            return

        # Step 2: Initial full sync
        await self._sync_all()

        # Step 3: Start polling loop
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())

    async def stop(self):
        """Disconnect and stop polling."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.delete(
                    f"{BRIDGE_URL}/disconnect",
                    params={"user_id": self.user_id},
                    headers=_bridge_headers(),
                )
        except Exception as e:
            logger.warning(f"Bridge disconnect error for {self.user_id}: {e}")

        self._connected = False
        logger.info(f"MT5BridgeWorker stopped for user {self.user_id}")

    async def _poll_loop(self):
        """Periodic polling of trades, positions, account."""
        while self._running:
            try:
                await asyncio.sleep(self.interval)
                await self._sync_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Poll error for user {self.user_id}: {e}")
                if self.on_error:
                    await self.on_error(str(e))

    async def _sync_all(self):
        """Fetch trades + positions + account and emit callbacks."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            params = {"user_id": self.user_id}
            headers = _bridge_headers()

            # Fetch all in parallel
            trades_resp, pos_resp, acc_resp = await asyncio.gather(
                client.get(f"{BRIDGE_URL}/trades", params=params, headers=headers),
                client.get(f"{BRIDGE_URL}/positions", params=params, headers=headers),
                client.get(f"{BRIDGE_URL}/account", params=params, headers=headers),
                return_exceptions=True,
            )

        if isinstance(trades_resp, Exception):
            logger.error(f"Trades fetch error: {trades_resp}")
        elif trades_resp.status_code == 200:
            payload = trades_resp.json()
            if self.on_data:
                await self.on_data({"type": "trades", "trades": payload.get("trades", [])})

        if isinstance(pos_resp, Exception):
            logger.error(f"Positions fetch error: {pos_resp}")
        elif pos_resp.status_code == 200:
            payload = pos_resp.json()
            if self.on_data:
                await self.on_data({"type": "positions", "positions": payload.get("positions", [])})

        if isinstance(acc_resp, Exception):
            logger.error(f"Account fetch error: {acc_resp}")
        elif acc_resp.status_code == 200:
            self._account_info = acc_resp.json()
            if self.on_data:
                await self.on_data({"type": "account", "account": self._account_info})

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def account_info(self) -> dict:
        return self._account_info

    async def get_trades(self) -> list:
        """Fetch trades on demand."""
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    f"{BRIDGE_URL}/trades",
                    params={"user_id": self.user_id},
                    headers=_bridge_headers(),
                )
                resp.raise_for_status()
                return resp.json().get("trades", [])
        except Exception as e:
            logger.error(f"get_trades error: {e}")
            return []

    async def get_positions(self) -> list:
        """Fetch live positions on demand."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{BRIDGE_URL}/positions",
                    params={"user_id": self.user_id},
                    headers=_bridge_headers(),
                )
                resp.raise_for_status()
                return resp.json().get("positions", [])
        except Exception as e:
            logger.error(f"get_positions error: {e}")
            return []


# ── Manager singleton ─────────────────────────────────────────────────────────
class MT5BridgeManager:
    def __init__(self):
        self._workers: dict[str, MT5BridgeWorker] = {}

    async def connect(
        self,
        user_id: str,
        login: int,
        password: str,
        server: str,
        on_data: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
    ) -> MT5BridgeWorker:
        # Disconnect existing if any
        await self.disconnect(user_id)

        worker = MT5BridgeWorker(
            user_id=user_id,
            login=login,
            password=password,
            server=server,
            on_data=on_data,
            on_error=on_error,
        )
        self._workers[user_id] = worker
        await worker.start()
        return worker

    async def disconnect(self, user_id: str):
        worker = self._workers.pop(user_id, None)
        if worker:
            await worker.stop()

    def get_worker(self, user_id: str) -> Optional[MT5BridgeWorker]:
        return self._workers.get(user_id)

    def is_connected(self, user_id: str) -> bool:
        w = self._workers.get(user_id)
        return w.is_connected if w else False

    def get_account_info(self, user_id: str) -> dict:
        w = self._workers.get(user_id)
        return w.account_info if w else {}

    async def get_trades(self, user_id: str) -> list:
        w = self._workers.get(user_id)
        return await w.get_trades() if w else []

    async def get_positions(self, user_id: str) -> list:
        w = self._workers.get(user_id)
        return await w.get_positions() if w else []

    async def check_bridge_health(self) -> bool:
        """Check if the MT5 Bridge server is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{BRIDGE_URL}/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def shutdown(self):
        for user_id in list(self._workers.keys()):
            await self.disconnect(user_id)


# ── Global singleton ──────────────────────────────────────────────────────────
mt5_manager = MT5BridgeManager()
