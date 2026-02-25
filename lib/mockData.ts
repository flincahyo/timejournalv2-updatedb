import { Trade } from "@/types";
import { toWIB, calcPips, detectSession } from "@/lib/utils";
import { PAIRS_LIST, SESSIONS_LIST, SETUPS_LIST, EMOTIONS_LIST } from "@/lib/constants";

export function generateMockTrades(count = 80): Trade[] {
  const trades: Trade[] = [];
  const now = new Date();
  let ticket = 1000000;

  for (let i = count; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.floor(i * 0.75));
    const n = Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const open = new Date(d);
      open.setHours(Math.floor(Math.random() * 16) + 2, Math.floor(Math.random() * 60));
      const durationMs = (Math.floor(Math.random() * 240) + 5) * 60 * 1000;
      const close = new Date(open.getTime() + durationMs);
      const symbol = PAIRS_LIST[Math.floor(Math.random() * PAIRS_LIST.length)];
      const type = Math.random() > 0.5 ? "BUY" : "SELL";
      const lots = parseFloat((Math.random() * 0.9 + 0.1).toFixed(2));
      const openPrice = parseFloat((Math.random() * 0.5 + 1.05).toFixed(5));
      const pnl = parseFloat((Math.random() * 500 - 180).toFixed(2));
      const pips = calcPips(symbol, openPrice, openPrice + (pnl > 0 ? 0.0010 : -0.0010), type);
      const sl = parseFloat((Math.random() * 20 + 5).toFixed(1));
      const tp = parseFloat((Math.random() * 50 + 10).toFixed(1));
      const openT = open.toISOString();
      const closeT = close.toISOString();

      trades.push({
        id: `mock_${ticket}`,
        ticket: ticket++,
        symbol,
        type,
        lots,
        openTime: openT,
        openTimeWIB: toWIB(openT),
        closeTime: closeT,
        closeTimeWIB: toWIB(closeT),
        openPrice,
        closePrice: parseFloat((openPrice + (Math.random() - 0.5) * 0.01).toFixed(5)),
        sl,
        tp,
        pnl,
        pips,
        avgPipsPerTrade: pips,
        swap: parseFloat((Math.random() * -2).toFixed(2)),
        commission: parseFloat((Math.random() * -3).toFixed(2)),
        rr: parseFloat((Math.abs(tp) / Math.max(sl, 1)).toFixed(2)),
        session: detectSession(open.getUTCHours()),
        setup: SETUPS_LIST[Math.floor(Math.random() * SETUPS_LIST.length)],
        emotion: EMOTIONS_LIST[Math.floor(Math.random() * EMOTIONS_LIST.length)],
        status: "closed",
        closeType: pnl > 0 ? "target_hit" : Math.random() > 0.5 ? "stopped_out" : "manually_closed",
        durationMs,
        isIntraday: durationMs < 86400000,
      });
    }
  }
  return trades.sort((a, b) => b.openTime.localeCompare(a.openTime));
}
