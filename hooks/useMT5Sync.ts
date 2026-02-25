"use client";
import { useEffect, useRef, useCallback } from "react";
import { useMT5Store } from "@/store";
import { Trade } from "@/types";
import { toWIB, toWIBDate, calcPips, detectSession } from "@/lib/utils";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const POLL_INTERVAL = 10000;

// â”€â”€ BUG 2 FIX: Validasi arah BUY/SELL pakai price movement + PnL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MT5 kadang kirim type yang terbalik. Cross-check:
//   BUY  profit  = close > open  (price naik = profit untuk buyer)
//   SELL profit  = close < open  (price turun = profit untuk seller)
function fixDirection(
  open: number, close: number, pnl: number, declared: "BUY" | "SELL"
): "BUY" | "SELL" {
  if (!open || !close || Math.abs(open - close) < 1e-9) return declared; // tidak cukup data
  const priceUp = close > open;
  const profitable = pnl > 0;
  // Kalau price naik dan profit → BUY; price naik dan rugi → SELL
  // Kalau price turun dan profit → SELL; price turun dan rugi → BUY
  if (priceUp && profitable) return "BUY";
  if (priceUp && !profitable) return "SELL";
  if (!priceUp && profitable) return "SELL";
  return "BUY";
}

// â”€â”€ BUG 4 FIX: pip size lengkap untuk semua instrumen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getPipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1;
  if (s.includes("XAG") || s.includes("SILVER")) return 0.01;
  if (s.includes("BTC") || s.includes("BITCOIN")) return 1.0;
  if (s.includes("ETH") || s.includes("ETHEREUM")) return 0.1;
  if (s.includes("NAS") || s.includes("US100")) return 1.0;  // Nasdaq
  if (s.includes("SPX") || s.includes("US500")) return 0.1;  // S&P500
  if (s.includes("DOW") || s.includes("US30")) return 1.0;  // Dow Jones
  if (s.includes("DAX") || s.includes("GER")) return 1.0;  // DAX
  if (s.includes("FTSe") || s.includes("UK100")) return 1.0;  // FTSE
  if (s.includes("OIL") || s.includes("WTI")) return 0.01; // Oil
  return 0.0001; // default forex pairs
}

// BUG 4 FIX: calcPips menggunakan pip size yang benar per instrumen
function calcPipsFixed(symbol: string, open: number, close: number, type: "BUY" | "SELL"): number {
  if (!open || !close) return 0;
  // BUY profit dari price naik; SELL profit dari price turun
  const diff = type === "BUY" ? close - open : open - close;
  const pipSize = getPipSize(symbol);
  return parseFloat((diff / pipSize).toFixed(1));
}

function normalizeTrade(raw: Record<string, unknown>): Trade {
  const openTime = String(raw.openTime || raw.open_time || "");
  const closeTime = String(raw.closeTime || raw.close_time || "");
  const symbol = String(raw.symbol || "");
  const openPrice = Number(raw.openPrice || raw.open_price || 0);
  const closePrice = Number(raw.closePrice || raw.close_price || 0);
  const pnl = Number(raw.pnl || 0);
  const status = String(raw.status || "closed") as "closed" | "live";

  // BUG 2 FIX: validasi direction sebelum dipakai
  const declared = (String(raw.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL";
  const type = fixDirection(openPrice, closePrice, pnl, declared);

  // BUG 4 FIX: hitung pips pakai fungsi yang sudah diperbaiki
  const pips = calcPipsFixed(symbol, openPrice, closePrice, type);

  const openDate = new Date(openTime);
  const closeDate = new Date(closeTime);
  const durationMs = Math.max(closeDate.getTime() - openDate.getTime(), 0);
  const openHour = openDate.getUTCHours();

  const sl = Number(raw.sl || 0);
  const tp = Number(raw.tp || 0);

  // BUG FIX: Use backend's accurate closeType if provided, otherwise fallback to basic math
  let closeType: "all" | "target_hit" | "stopped_out" | "manually_closed" = (raw.closeType as any) || "manually_closed";
  if (!raw.closeType) {
    if (tp > 0 && Math.abs(closePrice - tp) / Math.max(tp, 1) < 0.001) closeType = "target_hit";
    else if (sl > 0 && Math.abs(closePrice - sl) / Math.max(sl, 1) < 0.001) closeType = "stopped_out";
  }

  const rr = sl > 0 && tp > 0 && openPrice > 0
    ? Math.abs(tp - openPrice) / Math.abs(openPrice - sl)
    : Number(raw.rr || 0);

  return {
    id: String(raw.id || raw.ticket),
    ticket: Number(raw.ticket || 0),
    symbol,
    type,           // sudah divalidasi (BUG 2 fix)
    lots: Number(raw.lots || 0),
    openTime,
    openTimeWIB: toWIB(openTime),
    closeTime,
    closeTimeWIB: toWIB(closeTime),
    openPrice,
    closePrice,
    sl,
    tp,
    pnl,
    pips,           // sudah dihitung ulang (BUG 4 fix)
    avgPipsPerTrade: pips,
    swap: Number(raw.swap || 0),
    commission: Number(raw.commission || 0),
    rr: parseFloat(rr.toFixed(2)),
    session: detectSession(openTime),
    setup: String(raw.setup || "MT5 Import"),
    emotion: String(raw.emotion || "Neutral"),
    status,
    closeType,
    durationMs,
    isIntraday: durationMs < 86400000,
  };
}

export function useMT5Sync() {
  const { isConnected, connectionParams, setTrades, setLiveTrades, setAccount, setLastSync } = useMT5Store();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const syncLive = useCallback(async () => {
    if (!isConnected) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/mt5/sync`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.account) setAccount(data.account);
      if (data.live_trades) setLiveTrades((data.live_trades as Record<string, unknown>[]).map(normalizeTrade));
      if (data.new_trades?.length) {
        const { trades } = useMT5Store.getState();
        const existingIds = new Set(trades.map((t: Trade) => t.id));
        const newOnes = (data.new_trades as Record<string, unknown>[])
          .map(normalizeTrade)
          .filter((t: Trade) => !existingIds.has(t.id));
        if (newOnes.length) setTrades([...newOnes, ...trades]);
      }
      setLastSync(new Date().toISOString());
    } catch (e) {
      console.warn("MT5 sync error:", e);
    }
  }, [isConnected, setAccount, setLiveTrades, setTrades, setLastSync]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    syncLive();
    pollRef.current = setInterval(syncLive, POLL_INTERVAL);
  }, [syncLive]);

  const reconnectAttempts = useRef(0);

  const startWebSocket = useCallback(() => {
    if (!isConnected) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      if (wsRef.current) wsRef.current.close();
      const wsUrl = BACKEND_URL.replace("http", "ws") + "/ws/mt5";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      let pingInterval: ReturnType<typeof setInterval>;

      ws.onopen = () => {
        reconnectAttempts.current = 0; // Reset backoff on success
        if (pollRef.current) clearInterval(pollRef.current);

        // Keep-alive ping to prevent silent TCP drops on standby
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "pong") return; // Ignore ping responses

          if (data.type === "account_update" && data.account) setAccount(data.account);
          if (data.type === "live_trades" && data.trades)
            setLiveTrades((data.trades as Record<string, unknown>[]).map(normalizeTrade));
          if (data.type === "new_trade" && data.trade) {
            const t = normalizeTrade(data.trade as Record<string, unknown>);
            const { trades } = useMT5Store.getState();
            if (!trades.find((x: Trade) => x.id === t.id)) setTrades([t, ...trades]);
          }
          setLastSync(new Date().toISOString());
        } catch { }
      };

      const handleReconnect = () => {
        clearInterval(pingInterval);
        if (!isConnected) return;

        const timeout = Math.min(1000 * (2 ** reconnectAttempts.current), 30000);
        reconnectAttempts.current += 1;

        setTimeout(() => {
          if (isConnected) startWebSocket();
        }, timeout);
      };

      ws.onclose = handleReconnect;
      ws.onerror = () => { ws.close(); };
    } catch {
      // Fallback
      if (isConnected) setTimeout(startWebSocket, 5000);
    }
  }, [isConnected, setAccount, setLiveTrades, setTrades, setLastSync]);

  const reconnect = useCallback(async () => {
    if (!connectionParams) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/mt5/reconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectionParams),
      });
      if (res.ok) { const data = await res.json(); if (data.account) setAccount(data.account); startPolling(); }
    } catch { }
  }, [connectionParams, setAccount, startPolling]);

  useEffect(() => {
    if (!isConnected) {
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) wsRef.current.close();
      return;
    }

    // Fire an immediate REST sync so we get data instantly without waiting for WS handshake delay
    syncLive();
    startWebSocket();

    // Immediately reconnect when the tab becomes active/visible again
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isConnected) {
        syncLive();
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttempts.current = 0;
          startWebSocket();
        }
      }
    };

    // Immediately reconnect when internet is restored
    const handleOnline = () => {
      if (isConnected) {
        reconnectAttempts.current = 0;
        startWebSocket();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) wsRef.current.close();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [isConnected, startWebSocket]);

  return { syncLive, reconnect };
}

export { normalizeTrade };
