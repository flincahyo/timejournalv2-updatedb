"use client";
import { useEffect, useRef, useCallback } from "react";
import { useMT5Store } from "@/store";
import { Trade } from "@/types";
import { toWIB, calcPips, detectSession } from "@/lib/utils";
import { getToken, buildWsUrl, apiGet } from "@/lib/api";

const POLL_INTERVAL = 10000;

function fixDirection(open: number, close: number, pnl: number, declared: "BUY" | "SELL"): "BUY" | "SELL" {
  if (!open || !close || Math.abs(open - close) < 1e-9) return declared;
  const priceUp = close > open;
  const profitable = pnl > 0;
  if (priceUp && profitable) return "BUY";
  if (priceUp && !profitable) return "SELL";
  if (!priceUp && profitable) return "SELL";
  return "BUY";
}

function getPipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1;
  if (s.includes("XAG") || s.includes("SILVER")) return 0.01;
  if (s.includes("BTC") || s.includes("BITCOIN")) return 1.0;
  if (s.includes("ETH") || s.includes("ETHEREUM")) return 0.1;
  if (s.includes("NAS") || s.includes("US100")) return 1.0;
  if (s.includes("SPX") || s.includes("US500")) return 0.1;
  if (s.includes("DOW") || s.includes("US30")) return 1.0;
  if (s.includes("DAX") || s.includes("GER")) return 1.0;
  if (s.includes("OIL") || s.includes("WTI")) return 0.01;
  return 0.0001;
}

function calcPipsFixed(symbol: string, open: number, close: number, type: "BUY" | "SELL"): number {
  if (!open || !close) return 0;
  const diff = type === "BUY" ? close - open : open - close;
  return parseFloat((diff / getPipSize(symbol)).toFixed(1));
}

export function normalizeTrade(raw: Record<string, unknown>): Trade {
  const openTime = String(raw.openTime || raw.open_time || "");
  const closeTime = String(raw.closeTime || raw.close_time || "");
  const symbol = String(raw.symbol || "");
  const openPrice = Number(raw.openPrice || raw.open_price || 0);
  const closePrice = Number(raw.closePrice || raw.close_price || 0);
  const pnl = Number(raw.pnl || 0);
  const status = String(raw.status || "closed") as "closed" | "live";
  const declared = (String(raw.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL";
  const type = fixDirection(openPrice, closePrice, pnl, declared);
  const pips = calcPipsFixed(symbol, openPrice, closePrice, type);
  const openDate = new Date(openTime);
  const closeDate = new Date(closeTime);
  const durationMs = Math.max(closeDate.getTime() - openDate.getTime(), 0);
  const sl = Number(raw.sl || 0);
  const tp = Number(raw.tp || 0);
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
    symbol, type, lots: Number(raw.lots || 0),
    openTime, openTimeWIB: toWIB(openTime),
    closeTime, closeTimeWIB: toWIB(closeTime),
    openPrice, closePrice, sl, tp, pnl, pips,
    avgPipsPerTrade: pips,
    swap: Number(raw.swap || 0),
    commission: Number(raw.commission || 0),
    rr: parseFloat(rr.toFixed(2)),
    session: detectSession(openTime),
    setup: String(raw.setup || "MT5 Import"),
    emotion: String(raw.emotion || "Neutral"),
    status, closeType, durationMs, isIntraday: durationMs < 86400000,
  };
}

export function useMT5Sync() {
  const { isConnected, setTrades, setLiveTrades, setAccount, setLastSync } = useMT5Store();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);

  // JWT-authenticated sync polling (fallback if WS drops)
  const syncLive = useCallback(async () => {
    if (!isConnected || !getToken()) return;
    try {
      const data = await apiGet<{
        account?: unknown; live_trades?: unknown[]; new_trades?: unknown[];
      }>("/api/mt5/status");
      if (data.account) setAccount(data.account as any);
      setLastSync(new Date().toISOString());
    } catch { }
  }, [isConnected, setAccount, setLastSync]);

  const startWebSocket = useCallback(() => {
    if (!isConnected || !getToken()) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    try {
      if (wsRef.current) wsRef.current.close();
      // Token passed as query param — see backend ws_mt5 endpoint
      const ws = new WebSocket(buildWsUrl("/ws/mt5"));
      wsRef.current = ws;

      let pingInterval: ReturnType<typeof setInterval>;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 15000);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "pong") return;
          if (data.type === "account_update" && data.account) setAccount(data.account);
          if (data.type === "live_trades" && data.trades)
            setLiveTrades((data.trades as Record<string, unknown>[]).map(normalizeTrade));

          if ((data.type === "all_trades" || data.type === "history_batch") && data.trades) {
            const incoming = (data.trades as Record<string, unknown>[]).map(normalizeTrade);
            const { trades: existing } = useMT5Store.getState();

            // Merge and remove duplicates by ID
            const merged = [...incoming];
            existing.forEach(t => {
              if (!merged.find(m => m.id === t.id)) merged.push(t);
            });

            // Sort by time descending
            merged.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
            setTrades(merged);
          }

          if (data.type === "new_trade" && data.trade) {
            const t = normalizeTrade(data.trade as Record<string, unknown>);
            const { trades } = useMT5Store.getState();
            if (!trades.find((x: Trade) => x.id === t.id)) setTrades([t, ...trades]);
          }
          if (data.type === "connected" && data.account) {
            setAccount(data.account);
          }
          setLastSync(new Date().toISOString());
        } catch { }
      };

      const handleReconnect = () => {
        clearInterval(pingInterval);
        if (!isConnected) return;
        const timeout = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectAttempts.current += 1;
        setTimeout(() => { if (isConnected) startWebSocket(); }, timeout);
      };

      ws.onclose = handleReconnect;
      ws.onerror = () => ws.close();
    } catch {
      if (isConnected) setTimeout(startWebSocket, 5000);
    }
  }, [isConnected, setAccount, setLiveTrades, setTrades, setLastSync]);

  useEffect(() => {
    if (!isConnected) {
      if (wsRef.current) wsRef.current.close();
      return;
    }
    syncLive();
    startWebSocket();

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isConnected) {
        syncLive();
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttempts.current = 0;
          startWebSocket();
        }
      }
    };
    const handleOnline = () => {
      if (isConnected) { reconnectAttempts.current = 0; startWebSocket(); }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      if (wsRef.current) wsRef.current.close();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [isConnected, startWebSocket]);

  return { syncLive };
}
