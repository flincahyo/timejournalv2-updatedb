"use client";

import { useEffect, useRef } from "react";
import { useAlertStore } from "@/store";

export function AlertWatcher() {
    const { alerts, notifiedIds, markNotified, clearOldNotified, activeToasts, addToast, removeToast, updateAlert } = useAlertStore();
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Clear old notified IDs occasionally
        const cleanup = setInterval(() => {
            clearOldNotified();
        }, 1000 * 60 * 60 * 24); // daily
        return () => clearInterval(cleanup);
    }, [clearOldNotified]);

    useEffect(() => {
        const pollCandles = async () => {
            const activeAlerts = alerts.filter(a => a.enabled);
            if (activeAlerts.length === 0) return;

            // Group active requests uniquely by symbol+tf
            const requestMap = new Map<string, { symbol: string, timeframe: string }>();
            activeAlerts.forEach(a => {
                // For price alerts, we just need M1 data for quickest tick simulation 
                // since our backend WS only caches live positions, not global symbols
                const tf = a.type === "candle" ? a.timeframe : "M1";
                const key = `${a.symbol}_${tf}`;
                if (!requestMap.has(key)) {
                    requestMap.set(key, { symbol: a.symbol, timeframe: tf });
                }
            });

            try {
                const payload = { items: Array.from(requestMap.values()) };
                const res = await fetch("http://localhost:8000/api/candles", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) return;
                const json = await res.json();
                if (!json.data || !Array.isArray(json.data)) return;

                // Process results
                for (const result of json.data) {
                    const { symbol, timeframe, candles } = result;
                    if (!candles || candles.length < 2) continue;

                    // index 1 is the current forming live candle (current tick)
                    const liveCandle = candles[1];
                    const currentPrice = liveCandle.close;

                    for (const alert of activeAlerts) {
                        if (alert.symbol !== symbol) continue;

                        // â”€â”€ Handle Candle Alerts â”€â”€
                        if (alert.type === "candle" && alert.timeframe === timeframe) {
                            const notifId = `${alert.id}_${liveCandle.time}`;
                            if (notifiedIds.includes(notifId)) continue;

                            const bodyDiff = Math.abs(currentPrice - liveCandle.open);
                            const bodyPips = calcPips(symbol, bodyDiff);
                            const totalRange = liveCandle.high - liveCandle.low;
                            const wickPercent = totalRange > 0 ? ((totalRange - bodyDiff) / totalRange) * 100 : 0;

                            if (bodyPips >= alert.minBodyPips && wickPercent <= alert.maxWickPercent) {
                                markNotified(notifId);
                                const direction = currentPrice > liveCandle.open ? "Bullish" : "Bearish";
                                addToast({
                                    title: `🚨 ${symbol} ${alert.timeframe} Momentum!`,
                                    message: `${direction} candle with ${bodyPips.toFixed(1)} pips body and ${wickPercent.toFixed(0)}% wick is currently forming!`,
                                    type: direction.toLowerCase() as "bullish" | "bearish"
                                });
                                fireAlert(alert, symbol, currentPrice > liveCandle.open ? "Bullish" : "Bearish",
                                    `${direction} candle with ${bodyPips.toFixed(1)} pips body and ${wickPercent.toFixed(0)}% wick is currently forming!`);
                            }
                        }

                        // â”€â”€ Handle Price Alerts â”€â”€
                        else if (alert.type === "price" && timeframe === "M1") {
                            // Only check Price Alerts against the fast M1 tick feed
                            const isAbove = alert.trigger === "Above" && currentPrice >= alert.targetPrice;
                            const isBelow = alert.trigger === "Below" && currentPrice <= alert.targetPrice;
                            const isCrosses = alert.trigger === "Crosses" && liveCandle.low <= alert.targetPrice && liveCandle.high >= alert.targetPrice;

                            if (isAbove || isBelow || isCrosses) {
                                // For price alerts, use minute-level debounce if Everytime
                                const notifId = `${alert.id}_${Math.floor(Date.now() / 60000)}`;
                                if (notifiedIds.includes(notifId)) continue;
                                markNotified(notifId);

                                let dirName = "Bullish";
                                if (alert.trigger === "Below") dirName = "Bearish";
                                else if (alert.trigger === "Crosses") dirName = currentPrice >= liveCandle.open ? "Bullish" : "Bearish";

                                const noteStr = alert.notes ? `\nNote: ${alert.notes}` : "";

                                addToast({
                                    title: `🎯 ${symbol} Price Target!`,
                                    message: `${symbol} crossed ${alert.trigger === "Crosses" ? "target" : alert.trigger} ${alert.targetPrice}! ${noteStr}`,
                                    type: dirName.toLowerCase() as "bullish" | "bearish"
                                });
                                fireAlert(alert, symbol, dirName, `${symbol} crossed ${alert.trigger === "Crosses" ? "target" : alert.trigger} ${alert.targetPrice}! ${noteStr}`);

                                if (alert.frequency === "Once") {
                                    updateAlert(alert.id, { enabled: false });
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("AlertWatcher polling error", err);
            }
        };

        pollingRef.current = setInterval(pollCandles, 5000); // 5 sec poll
        pollCandles();

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [alerts, notifiedIds, markNotified, addToast, updateAlert]);

    if (activeToasts.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
            {activeToasts.map(toast => (
                <div
                    key={toast.id}
                    className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] glass-panel border backdrop-blur-md min-w-[320px] max-w-[400px] animate-in slide-in-from-top-4 fade-in duration-300"
                    style={{ borderColor: toast.type === 'bullish' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }}
                >
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-inner" style={{ backgroundColor: toast.type === 'bullish' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={toast.type === 'bullish' ? '#22c55e' : '#ef4444'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {toast.type === 'bullish' ? <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline> : <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>}
                            {toast.type === 'bullish' ? <polyline points="17 6 23 6 23 12"></polyline> : <polyline points="17 18 23 18 23 12"></polyline>}
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-text truncate">{toast.title}</div>
                        <div className="text-[11px] font-semibold text-text2 truncate">{toast.message}</div>
                    </div>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface3 text-text3 transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            ))}
        </div>
    );
}

function calcPips(symbol: string, diff: number) {
    const s = symbol.toUpperCase();
    let pip = 0.0001;
    if (s.includes("JPY")) pip = 0.01;
    else if (s.includes("XAU") || s.includes("GOLD")) pip = 0.1;
    else if (s.includes("XAG") || s.includes("SILVER")) pip = 0.01;
    else if (s.includes("BTC") || s.includes("BITCOIN")) pip = 1.0;
    else if (s.includes("ETH") || s.includes("ETHEREUM")) pip = 0.1;
    else if (s.includes("NAS") || s.includes("US100")) pip = 1.0;
    else if (s.includes("SPX") || s.includes("US500")) pip = 0.1;
    else if (s.includes("DOW") || s.includes("US30")) pip = 1.0;
    else if (s.includes("DAX") || s.includes("GER")) pip = 1.0;
    else if (s.includes("OIL") || s.includes("WTI")) pip = 0.01;
    return Math.abs(diff / pip);
}

function fireAlert(alert: any, symbol: string, direction: string, bodyText: string) {
    const title = alert.type === "price" ? `🎯 ${symbol} Price Target!` : `🚨 ${symbol} ${alert.timeframe} Momentum!`;

    // 1. Desktop HTML5 Web Notification API
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: bodyText });
    }

    // 2. Mobile React Native WebView Bridge
    if (typeof window !== "undefined" && (window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({
            type: 'NATIVE_NOTIFICATION',
            title: title,
            body: bodyText,
            data: { symbol, direction, alertId: alert.id }
        }));
    }

    if (alert.soundUri) {
        try {
            const audio = new Audio(alert.soundUri);
            audio.play().catch(e => console.error("Audio playback failed (interaction required?):", e));
        } catch (e) { }
    }
}
