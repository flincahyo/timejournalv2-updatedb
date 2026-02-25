import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Converts any ISO timestamp to WIB (UTC+7)
// Returns: "yyyy-MM-dd HH:mm:ss" — clean, slice-safe, no offset suffix
export function toWIB(dateStr: string) {
  if (!dateStr) return "";
  try {
    const zoned = toZonedTime(parseISO(dateStr), 'Asia/Jakarta');
    return format(zoned, "yyyy-MM-dd HH:mm:ss");
  } catch {
    return dateStr;
  }
}

// Format a WIB timestamp string for human-readable display
// Input:  "2024-05-15 19:30:00"
// Output: "15 Mei 19:30 WIB"
export function fmtWIBDisplay(wibStr: string) {
  if (!wibStr || wibStr.length < 16) return wibStr || "-";
  try {
    // Parse as local (no TZ shift since it's already WIB)
    const dt = new Date(wibStr.replace(" ", "T") + "+07:00");
    return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" })
      + " " + wibStr.slice(11, 16) + " WIB";
  } catch {
    return wibStr.slice(0, 16);
  }
}

export function toWIBDate(dateStr: string) {
  if (!dateStr) return "";
  try {
    const zoned = toZonedTime(parseISO(dateStr), 'Asia/Jakarta');
    return format(zoned, "dd MMM yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

// DST-aware Forex session detector — mirrors backend logic.
// Uses Intl.DateTimeFormat to get London & NY local hours, which auto-adjusts DST.
// Sessions: Tokyo, Sydney, London, Overlap (LDN+NY), New York
export function detectSession(
  dateStr: string | number
): "Tokyo" | "Sydney" | "London" | "Overlap (LDN+NY)" | "New York" | "Unknown" {
  if (dateStr === undefined || dateStr === null) return "Unknown";
  try {
    let date: Date;
    if (typeof dateStr === "number") {
      // Assume WIB hour number (legacy fallback) — approximate UTC
      const utcH = (dateStr - 7 + 24) % 24;
      date = new Date(Date.UTC(2024, 0, 1, utcH, 0, 0));
    } else {
      // Parse ISO or WIB string
      if (dateStr.length >= 13 && dateStr[4] === "-" && !dateStr.includes("T")) {
        // WIB string "yyyy-MM-dd HH:mm:ss" — add WIB offset to get UTC
        date = new Date(dateStr.replace(" ", "T") + "+07:00");
      } else {
        date = new Date(dateStr);
      }
    }
    if (isNaN(date.getTime())) return "Unknown";

    // Get local hour in London and New York (DST-aware via browser Intl)
    const getLocalHour = (tz: string) =>
      parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(date), 10) % 24;

    const londonHour = getLocalHour("Europe/London");
    const nyHour = getLocalHour("America/New_York");

    const londonOpen = londonHour >= 8 && londonHour < 17;
    const nyOpen = nyHour >= 8 && nyHour < 17;

    if (londonOpen && nyOpen) return "Overlap (LDN+NY)";
    if (londonOpen) return "London";
    if (nyOpen) return "New York";

    // Tokyo (JST, no DST): 00:00–09:00 UTC
    const utcHour = date.getUTCHours();
    if (utcHour >= 0 && utcHour < 9) return "Tokyo";
    return "Sydney";
  } catch {
    return "Unknown";
  }
}

export function calcPips(symbol: string, open: number, close: number, type: "BUY" | "SELL" | string = "BUY") {
  if (!symbol || open === undefined || close === undefined) return 0;
  const isJpy = symbol.toUpperCase().includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const diff = type === "BUY" ? close - open : open - close;
  return Number((diff / pipSize).toFixed(1));
}

export function fmtUSD(val: number) {
  if (val === undefined || val === null) return "$0.00";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export function applyFilter(trades: any[], filter: any) {
  if (!trades || !filter) return trades || [];
  return trades.filter((t) => {
    // 1. Symbols
    if (filter.symbols && filter.symbols.length > 0) {
      if (!filter.symbols.includes(t.symbol)) return false;
    }
    // 2. Side
    if (filter.side && filter.side !== "all") {
      if (t.type?.toLowerCase() !== filter.side.toLowerCase()) return false;
    }
    // 3. CloseType
    if (filter.closeType && filter.closeType !== "all") {
      if (t.closeType !== filter.closeType) return false;
    }
    // 4. Setups
    if (filter.setups && filter.setups.length > 0) {
      if (!filter.setups.includes(t.setup)) return false;
    }
    // 5. Sessions
    if (filter.sessions && filter.sessions.length > 0) {
      if (!filter.sessions.includes(t.session)) return false;
    }
    // 6. Dates
    if (filter.dateFrom) {
      const dFrom = new Date(filter.dateFrom).getTime();
      const tTime = new Date(t.openTime || t.time).getTime();
      if (tTime < dFrom) return false;
    }
    if (filter.dateTo) {
      // Set to end of day
      const dTo = new Date(filter.dateTo);
      dTo.setHours(23, 59, 59, 999);
      const tTime = new Date(t.openTime || t.time).getTime();
      if (tTime > dTo.getTime()) return false;
    }
    // 7. Time limits against WIB string
    if (filter.timeFrom || filter.timeTo) {
      const wibHourStr = t.openTimeWIB ? t.openTimeWIB.slice(11, 16) : null;
      if (wibHourStr) {
        if (filter.timeFrom && wibHourStr < filter.timeFrom) return false;
        if (filter.timeTo && wibHourStr > filter.timeTo) return false;
      }
    }
    // 8. PnL limits
    if (filter.minPnl !== null && filter.minPnl !== undefined) {
      if ((t.pnl || 0) < filter.minPnl) return false;
    }
    if (filter.maxPnl !== null && filter.maxPnl !== undefined) {
      if ((t.pnl || 0) > filter.maxPnl) return false;
    }
    // 9. RR limits
    if (filter.minRR !== null && filter.minRR !== undefined) {
      if ((t.rr || 0) < filter.minRR) return false;
    }
    if (filter.maxRR !== null && filter.maxRR !== undefined) {
      if ((t.rr || 0) > filter.maxRR) return false;
    }

    // Generic fallbacks just in case
    if (filter.search && filter.search.trim() !== "") {
      const q = filter.search.toLowerCase();
      if (!t.symbol?.toLowerCase().includes(q) && !t.ticket?.toString().includes(q)) return false;
    }
    if (filter.status && filter.status !== "ALL" && filter.status !== "all" && t.status !== filter.status) return false;
    if (filter.type && filter.type !== "ALL" && filter.type !== "all" && t.type !== filter.type) return false;

    return true;
  });
}

export function calcStats(trades: any[]) {
  const closed = trades.filter((t) => t.status === "CLOSED" || t.pnl !== undefined);
  const totalTrades = closed.length;

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const grossLoss = losses.reduce((acc, t) => acc + Math.abs(t.pnl || 0), 0);

  const totalPnl = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  const longWins = wins.filter(t => t.type === "BUY").length;
  const longLosses = losses.filter(t => t.type === "BUY").length;
  const shortWins = wins.filter(t => t.type === "SELL").length;
  const shortLosses = losses.filter(t => t.type === "SELL").length;

  const totalPips = closed.reduce((acc, t) => acc + (t.pips || 0), 0);
  const avgPips = totalTrades > 0 ? totalPips / totalTrades : 0;
  const expectedValue = totalTrades > 0 ? totalPnl / totalTrades : 0;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;

  const symbolPnL: Record<string, { pnl: number, count: number, wins: number }> = {};
  closed.forEach(t => {
    if (t.symbol) {
      if (!symbolPnL[t.symbol]) symbolPnL[t.symbol] = { pnl: 0, count: 0, wins: 0 };
      symbolPnL[t.symbol].pnl += (t.pnl || 0);
      symbolPnL[t.symbol].count += 1;
      if (t.pnl > 0) symbolPnL[t.symbol].wins += 1;
    }
  });
  const symbolStats = Object.keys(symbolPnL)
    .map(sym => ({
      symbol: sym,
      pnl: symbolPnL[sym].pnl,
      count: symbolPnL[sym].count,
      winRate: (symbolPnL[sym].wins / symbolPnL[sym].count) * 100
    }))
    .sort((a, b) => b.pnl - a.pnl);
  const bestSymbol = symbolStats.length > 0 ? symbolStats[0].symbol : "N/A";
  const worstSymbol = symbolStats.length > 0 ? symbolStats[symbolStats.length - 1].symbol : "N/A";
  const numberOfSymbols = symbolStats.length;

  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let totalFees = 0;
  let totalHoldMs = 0;

  const sortedClosed = [...closed].sort((a, b) => new Date(a.closeTime || a.time).getTime() - new Date(b.closeTime || b.time).getTime());

  sortedClosed.forEach(t => {
    totalFees += (t.commission || 0) + (t.swap || 0);
    if (t.closeTime && t.openTime) {
      totalHoldMs += new Date(t.closeTime).getTime() - new Date(t.openTime).getTime();
    }

    if (t.pnl > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak;
    } else if (t.pnl < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > longestLossStreak) longestLossStreak = currentLossStreak;
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  });

  const avgTradeTimeMs = totalTrades > 0 ? totalHoldMs / totalTrades : 0;

  const bestTrade = totalTrades > 0 ? Math.max(...closed.map(t => t.pnl || 0)) : 0;
  const worstTrade = totalTrades > 0 ? Math.min(...closed.map(t => t.pnl || 0)) : 0;

  const getAvgHold = (tradesArr: any[]) => {
    const withTimes = tradesArr.filter(t => t.closeTime && t.openTime);
    if (!withTimes.length) return 0;
    const totalMs = withTimes.reduce((acc, t) => acc + (new Date(t.closeTime).getTime() - new Date(t.openTime).getTime()), 0);
    return totalMs / withTimes.length;
  };

  const avgHoldWins = getAvgHold(wins);
  const avgHoldLosses = getAvgHold(losses);
  const avgHoldLongs = getAvgHold(closed.filter(t => t.type === "BUY"));
  const avgHoldShorts = getAvgHold(closed.filter(t => t.type === "SELL"));

  let scalpingTrades = 0, scalpingWins = 0;
  let intradayTrades = 0, intradayWins = 0;
  let multidayTrades = 0, multidayWins = 0;

  closed.forEach(t => {
    if (!t.closeTime || !t.openTime) return;
    const ms = new Date(t.closeTime).getTime() - new Date(t.openTime).getTime();
    const isWin = (t.pnl || 0) > 0;
    if (ms < 3600000) { // < 1 hour
      scalpingTrades++; if (isWin) scalpingWins++;
    } else if (ms < 86400000) { // < 24 hours
      intradayTrades++; if (isWin) intradayWins++;
    } else {
      multidayTrades++; if (isWin) multidayWins++;
    }
  });

  const scalpingWinRate = scalpingTrades ? (scalpingWins / scalpingTrades) * 100 : 0;
  const intradayWinRate = intradayTrades ? (intradayWins / intradayTrades) * 100 : 0;
  const multidayWinRate = multidayTrades ? (multidayWins / multidayTrades) * 100 : 0;

  const lossRate = totalTrades > 0 ? (losses.length / totalTrades) * 100 : 0;
  const breakeven = totalTrades - wins.length - losses.length;
  const avgPnlPerTrade = totalTrades > 0 ? totalPnl / totalTrades : 0;

  const longs = closed.filter(t => t.type === "BUY");
  const shorts = closed.filter(t => t.type === "SELL");

  const longPnl = longs.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const longWinsArr = longs.filter(t => (t.pnl || 0) > 0);
  const longLossesArr = longs.filter(t => (t.pnl || 0) < 0);
  const longAvgWin = longWinsArr.length > 0 ? longWinsArr.reduce((acc, t) => acc + t.pnl, 0) / longWinsArr.length : 0;
  const longAvgLoss = longLossesArr.length > 0 ? longLossesArr.reduce((acc, t) => acc + Math.abs(t.pnl), 0) / longLossesArr.length : 0;

  const shortPnl = shorts.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const shortWinsArr = shorts.filter(t => (t.pnl || 0) > 0);
  const shortLossesArr = shorts.filter(t => (t.pnl || 0) < 0);
  const shortAvgWin = shortWinsArr.length > 0 ? shortWinsArr.reduce((acc, t) => acc + t.pnl, 0) / shortWinsArr.length : 0;
  const shortAvgLoss = shortLossesArr.length > 0 ? shortLossesArr.reduce((acc, t) => acc + Math.abs(t.pnl), 0) / shortLossesArr.length : 0;

  return {
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: Number(winRate.toFixed(1)),
    lossRate: Number(lossRate.toFixed(1)),
    totalPnl,
    profitFactor: Number(profitFactor.toFixed(2)),
    avgPnlPerTrade,
    longWins,
    longLosses,
    longPnl,
    longAvgWin,
    longAvgLoss,
    shortWins,
    shortLosses,
    shortPnl,
    shortAvgWin,
    shortAvgLoss,
    totalPips,
    avgPips,
    expectedValue,
    avgWin,
    avgLoss,
    avgRR,
    bestTrade,
    worstTrade,
    bestSymbol,
    worstSymbol,
    symbolStats,
    longestWinStreak,
    longestLossStreak,
    totalFees,
    avgTradeTimeMs,
    numberOfSymbols,
    avgHoldWins,
    avgHoldLosses,
    avgHoldLongs,
    avgHoldShorts,
    scalpingWinRate,
    intradayWinRate,
    multidayWinRate
  };
}

export function fmtPips(val: number) {
  if (val === undefined || val === null) return "0.0 pips";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)} pips`;
}

export function formatDuration(ms: number) {
  if (!ms || ms < 60000) return { str: "< 1m" };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return { str: `${h}h ${m}m` };
  return { str: `${m}m` };
}
