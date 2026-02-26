"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFilteredTrades, useMT5Store } from "@/store";
import { fmtUSD, fmtPips, formatDuration } from "@/lib/utils";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import ReactMarkdown from "react-markdown";
import { apiPost } from "@/lib/api";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PANZE DONUT CHART — like "Projects Overview" card
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DonutChart({ wins, losses, total }: { wins: number; losses: number; total: number }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 300); return () => clearTimeout(t); }, []);

  const r = 70, cx = 90, cy = 90, sw = 20;
  const circ = 2 * Math.PI * r;
  const winFrac = total ? wins / total : 0;
  const lossFrac = total ? losses / total : 0;
  const beFrac = total ? (total - wins - losses) / total : 0;
  const GAP = total > 0 ? 4 : 0;

  // Segments: Win (blue) → Loss (orange) → Breakeven (gray)
  const segments = [
    { frac: winFrac, color: "#2563eb", label: "Win" },
    { frac: lossFrac, color: "#f97316", label: "Loss" },
    { frac: beFrac, color: "var(--surface3)", label: "BE" },
  ].filter(s => s.frac > 0.001);

  let offset = circ * 0.25; // start from top
  return (
    <div className="relative w-[180px] h-[180px] mx-auto">
      <svg width="180" height="180">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface3)" strokeWidth={sw} />
        {/* Segments */}
        {segments.map((seg, i) => {
          const dash = circ * seg.frac - GAP;
          const gap = circ - dash;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={seg.color} strokeWidth={sw}
              strokeDasharray={drawn ? `${dash} ${gap}` : `0 ${circ}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="origin-center -rotate-90"
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                transition: `stroke-dasharray .9s cubic-bezier(.16,1,.3,1) ${i * .12}s`,
              }}
            />
          );
          offset -= dash + GAP;
          return el;
        })}
        {/* Center */}
        <text x={cx} y={cy - 5} textAnchor="middle" className="fill-text text-[24px] font-bold font-sans tracking-[-0.5px]">
          {total ? `${((wins / total) * 100).toFixed(0)}%` : "—"}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-text3 text-[10.5px] font-semibold font-sans tracking-[0.06em]">
          WIN RATE
        </text>
      </svg>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CHART TOOLTIP
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="bg-surface border border-border rounded-xl py-2 px-3.5 shadow-s2 text-xs">
      <div className="text-text3 mb-1 font-medium">{label}</div>
      <div className={`font-extrabold text-[14px] ${v >= 0 ? "text-green" : "text-red"}`}>
        {v >= 0 ? "+" : ""}${Math.abs(v).toFixed(2)}
      </div>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// KPI CARD — Panze white card with big number
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KpiCard({ label, value, sub, subPos, index = 0 }: {
  label: string; value: string; sub: string; subPos: boolean; index?: number;
}) {
  return (
    <div className="card au p-4" style={{ animationDelay: `${index * .07}s` }}>
      <div className="text-[10px] font-semibold text-text3 tracking-[.06em] uppercase mb-1.5">{label}</div>
      <div className="text-[22px] font-extrabold text-text tracking-[-0.6px] leading-tight mb-2">{value}</div>
      <div className={`text-[11.5px] font-semibold flex items-center gap-1.5 ${subPos ? 'text-green' : 'text-red'}`}>
        <span className="text-[8px]">{subPos ? "▲" : "▼"}</span>{sub}
      </div>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN PAGE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function DashboardPage() {
  const router = useRouter();
  const { filtered, stats } = useFilteredTrades();
  const { isConnected, account } = useMT5Store();
  const [mounted, setMounted] = useState(false);
  const [aiInsights, setAiInsights] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  // ⚠️ ALL hooks MUST be before any return — React rules of hooks
  const closed = filtered.filter(t => t.status === "closed");
  const live = filtered.filter(t => t.status === "live");

  const equityCurve = useMemo(() => {
    let run = 0;
    return closed.map((t, i) => {
      run += t.pnl;
      return { d: t.openTimeWIB?.slice(5, 10) ?? `#${i}`, v: parseFloat(run.toFixed(2)) };
    });
  }, [closed]);

  const monthlyData = useMemo(() => {
    const m: Record<string, number> = {};
    closed.forEach(t => { const k = t.openTimeWIB?.slice(0, 7) ?? ""; if (k) m[k] = (m[k] || 0) + t.pnl; });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, pnl]) => ({
      month: new Date(k + "-01T12:00:00").toLocaleDateString("id-ID", { month: "short" }),
      pnl: parseFloat(pnl.toFixed(2)),
    }));
  }, [closed]);

  const weeklyData = useMemo(() => {
    const m: Record<string, number> = {};
    closed.forEach(t => {
      const d = t.openTimeWIB?.slice(0, 10);
      if (!d) return;
      const dt = new Date(d + "T12:00:00");
      // ISO week: Mon-based week number within the month
      const dayOfMonth = dt.getDate();
      const weekNum = Math.ceil(dayOfMonth / 7);
      const monthLabel = dt.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
      const key = `${d.slice(0, 7)}-W${weekNum}`;
      const label = `W${weekNum} ${monthLabel}`;
      if (!m[key]) (m as any)[`_lbl_${key}`] = label;
      m[key] = (m[key] || 0) + t.pnl;
    });
    return Object.keys(m)
      .filter(k => !k.startsWith("_lbl_"))
      .sort()
      .slice(-16)
      .map(k => ({
        week: (m as any)[`_lbl_${k}`] ?? k.slice(-4),
        pnl: parseFloat(m[k].toFixed(2)),
      }));
  }, [closed]);

  const [flippedCard, setFlippedCard] = useState(false);
  const [flippedPipsCard, setFlippedPipsCard] = useState(false);

  const pipsBySymbol = useMemo(() => {
    const m: Record<string, { pips: number; count: number }> = {};
    closed.forEach(t => {
      if (!t.symbol) return;
      if (!m[t.symbol]) m[t.symbol] = { pips: 0, count: 0 };
      m[t.symbol].pips += t.pips || 0;
      m[t.symbol].count += 1;
    });
    return Object.entries(m)
      .map(([sym, d]) => ({ sym, pips: parseFloat(d.pips.toFixed(1)), count: d.count }))
      .sort((a, b) => Math.abs(b.pips) - Math.abs(a.pips))
      .slice(0, 8);
  }, [closed]);

  const symData = useMemo(() =>
    Object.values(stats.symbolStats ?? {}).sort((a, b) => b.pnl - a.pnl).slice(0, 5)
    , [stats]);

  const sessData = useMemo(() => {
    const m: Record<string, number> = {};
    closed.forEach(t => { m[t.session] = (m[t.session] || 0) + 1; });
    return Object.entries(m).sort(([, a], [, b]) => b - a);
  }, [closed]);
  const sessTotal = sessData.reduce((a, [, n]) => a + n, 0) || 1;

  const SESSION_META: Record<string, { label: string; hours: string; color: string }> = {
    "Tokyo": { label: "Tokyo", hours: "02:00–09:00 WIB", color: "#8b5cf6" },
    "Sydney": { label: "Sydney", hours: "04:00–13:00 WIB", color: "#6366f1" },
    "London": { label: "London", hours: "14:00–00:00 WIB", color: "#3b82f6" },
    "Overlap (LDN+NY)": { label: "Overlap LN+NY", hours: "19:00–00:00 WIB", color: "#f59e0b" },
    "New York": { label: "New York", hours: "19:00–05:00 WIB", color: "#10b981" },
  };

  const hourlyData = useMemo(() => {
    const m: Record<string, { pnl: number, count: number, wins: number }> = {};
    closed.forEach(t => {
      const h = t.openTimeWIB?.slice(11, 13);
      if (!h) return;
      if (!m[h]) m[h] = { pnl: 0, count: 0, wins: 0 };
      m[h].pnl += t.pnl;
      m[h].count += 1;
      if (t.pnl > 0) m[h].wins += 1;
    });
    // Sort descending by hour (e.g. 12:00, 11:00, 10:00) to match screenshot
    return Object.entries(m).sort(([a], [b]) => b.localeCompare(a));
  }, [closed]);

  const generateAIInsights = async () => {
    if (!stats || stats.totalTrades === 0) {
      alert("Belum ada data trading yang cukup untuk dianalisis oleh AI.");
      return;
    }

    setIsGeneratingAI(true);
    setAiInsights("");

    // Determine recent streak roughly
    const recentTrades = closed.slice(0, 10);
    const recentWins = recentTrades.filter(t => t.pnl > 0).length;
    const streakCtx = recentTrades.length ? `${recentWins} wins out of last ${recentTrades.length} trades.` : "No recent trades.";

    try {
      const payload = {
        totalTrades: stats.totalTrades,
        winRate: stats.winRate,
        totalPnl: stats.totalPnl,
        bestSymbol: stats.bestSymbol,
        worstSymbol: stats.worstSymbol,
        recentStreaks: streakCtx,
        notes: `Avg RR is ${stats.avgRR.toFixed(2)}, Longs: ${stats.longWins}/${stats.longWins + stats.longLosses || 0} wins, Shorts: ${stats.shortWins}/${stats.shortWins + stats.shortLosses || 0} wins.`
      };

      const data = await apiPost<any>("/api/ai/analyze", payload);
      if (data.success) {
        setAiInsights(data.insight);
      } else {
        setAiInsights("[ERROR] AI Agent gagal memberikan analisis. Cek koneksi backend/API Key Gemini.");
      }
    } catch (err) {
      console.error("AI Error:", err);
      setAiInsights("[ERROR] Terjadi kesalahan saat menghubungi API AI Analyst.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  if (!mounted) return (
    <div className="p-7">
      {[...Array(3)].map((_, i) => <div key={i} className="sk h-[110px] mb-3.5" />)}
      <div className="grid grid-cols-2 gap-3.5">
        {[...Array(2)].map((_, i) => <div key={i} className="sk h-[300px]" />)}
      </div>
    </div>
  );

  return (
    <div className="p-7">

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="au mb-6.5">
        <div className="text-xs font-semibold text-text3 mb-1 tracking-[.04em]">
          Manage and track your trades
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl mb-3 font-extrabold text-text tracking-[-0.8px] leading-tight">
            Trading Dashboard
          </h1>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="ai-btn flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold shadow-md cursor-pointer shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="relative z-10"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 12 2.1 12" /><path d="M12 12 21.9 12" /><path d="M12 12 12 21.9" /><path d="M12 12 12 2.1" /></svg>
              <span className="relative z-10">AI Analyst</span>
              <div className="ai-sparkle w-1 h-1 top-2 right-3 animation-delay-300"></div>
              <div className="ai-sparkle w-1.5 h-1.5 bottom-1.5 left-3 animation-delay-700"></div>
            </button>
            {live.length > 0 && (
              <button
                onClick={() => router.push('/dashboard/live')}
                className="flex items-center gap-2 bg-green-bg border border-green-br rounded-full py-2 px-3.5 hover:bg-green-br transition-colors cursor-pointer"
              >
                <div className="ldot"><span /></div>
                <span className="text-xs font-bold text-green">{live.length} Live</span>
              </button>
            )}
            {isConnected && account && (
              <div className="text-xs text-text3 font-medium bg-surface border border-border rounded-full py-2 px-3.5">
                #{account.login} ${account.balance?.toFixed(0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* â”€â”€ ROW 1: 4 KPI cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-4 gap-3.5 mb-3.5">
        <KpiCard index={0} label="Total PnL" value={fmtUSD(stats.totalPnl)} sub={`${stats.wins}W / ${stats.losses}L`} subPos={stats.totalPnl >= 0} />
        {/* Total Pips flip card */}
        <div
          className="flip-card au card cursor-pointer"
          style={{ animationDelay: "0.07s", minHeight: "110px" }}
          onClick={() => setFlippedPipsCard(f => !f)}
        >
          <div className={`flip-card-inner${flippedPipsCard ? " flipped" : ""}`}>
            {/* FRONT — summary */}
            <div className="flip-card-front p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold text-text3 tracking-[.06em] uppercase">Total Pips</div>
                <span className="text-[8px] text-text3 bg-surface2 border border-border rounded-full px-1.5 py-0.5 font-medium">per symbol ↻</span>
              </div>
              <div className="text-[22px] font-extrabold text-text tracking-[-0.6px] leading-tight my-1">
                {(stats.totalPips ?? 0) >= 0 ? "+" : ""}{(stats.totalPips ?? 0).toFixed(1)}
              </div>
              <div className={`text-[11.5px] font-semibold flex items-center gap-1.5 ${(stats.totalPips ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                <span className="text-[8px]">{(stats.totalPips ?? 0) >= 0 ? "▲" : "▼"}</span>
                Avg {(stats.avgPips ?? 0).toFixed(1)} pips/trade
              </div>
            </div>
            {/* BACK — per symbol */}
            <div className="flip-card-back p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-text uppercase tracking-[.05em]">Pips / Symbol</div>
                <span className="text-[8px] text-text3 bg-surface2 border border-border rounded-full px-1.5 py-0.5 font-medium">total ↻</span>
              </div>
              <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
                {pipsBySymbol.length === 0 && <span className="text-text3 text-[10px]">No data</span>}
                {pipsBySymbol.map(({ sym, pips }) => {
                  const maxAbs = Math.max(...pipsBySymbol.map(d => Math.abs(d.pips)), 1);
                  const pos = pips >= 0;
                  return (
                    <div key={sym}>
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="text-[9px] font-bold text-text2">{sym}</span>
                        <span className="text-[9px] font-bold font-mono" style={{ color: pos ? "#4f81c7" : "#b0793a" }}>
                          {pos ? "+" : ""}{pips}
                        </span>
                      </div>
                      <div className="h-[3px] bg-surface3 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(Math.abs(pips) / maxAbs) * 100}%`, background: pos ? "#4f81c7" : "#b0793a" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <KpiCard index={2} label="Profit Factor" value={stats.profitFactor.toFixed(2) + "×"} sub={`EV ${fmtUSD(stats.expectedValue)}`} subPos={stats.profitFactor >= 1} />
        <KpiCard index={3} label="Win Rate" value={stats.winRate.toFixed(1) + "%"} sub={`${stats.totalTrades} total trades`} subPos={stats.winRate >= 50} />
      </div>

      {/* â”€â”€ ROW 2: Donut (like "Projects Overview") + Equity + Monthly bar â”€â”€ */}
      <div className="grid grid-cols-[290px_1fr_300px] gap-3.5 mb-3.5">

        {/* Projects Overview style — Win Rate donut */}
        <div className="card au d2 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[12px] font-bold text-text">Win Rate</div>
              <div className="text-[11px] text-text3 mt-0.5">Trade performance</div>
            </div>
            <button onClick={() => router.push('/dashboard/analytics')} className="w-8 h-8 rounded-full border border-border bg-surface2 flex items-center justify-center cursor-pointer hover:bg-surface3 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
            </button>
          </div>
          <DonutChart wins={stats.wins} losses={stats.losses} total={stats.totalTrades} />
          {/* Legend — Panze dot + label */}
          <div className="flex flex-col gap-2 mt-4">
            {[
              { dot: "#2563eb", label: `Wins: ${stats.wins}` },
              { dot: "#f97316", label: `Losses: ${stats.losses}` },
              { dot: "var(--surface3)", label: `Breakeven: ${stats.totalTrades - stats.wins - stats.losses}` },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.dot }} />
                <span className="text-[12.5px] font-medium text-text2">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Equity Curve — like "Income VS Expense" */}
        <div className="card au d3 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[12px] font-bold text-text">Equity Curve</div>
              <div className="text-[11px] text-text3 mt-0.5">Kumulatif PnL</div>
            </div>
            <div className="text-right">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.25">
                  <div className="w-2 h-2 rounded-full border-[1.5px] border-surface bg-blue ring-1 ring-blue/20" />
                  <span className="text-[11px] text-text2">Profit: ${Math.max(stats.totalPnl, 0).toFixed(0)}</span>
                </div>
                <div className="flex items-center gap-1.25">
                  <div className="w-2 h-2 rounded-full border-[1.5px] border-surface bg-orange ring-1 ring-orange/20" />
                  <span className="text-[11px] text-text2">Loss: ${Math.abs(Math.min(stats.totalPnl, 0)).toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={equityCurve} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stats.totalPnl >= 0 ? "#2563eb" : "#f97316"} stopOpacity={.22} />
                  <stop offset="95%" stopColor={stats.totalPnl >= 0 ? "#2563eb" : "#f97316"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" />
              <XAxis dataKey="d" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} tickFormatter={v => `$${v}`} />
              <Tooltip content={<CTip />} />
              <Area type="monotone" dataKey="v" stroke={stats.totalPnl >= 0 ? "#2563eb" : "#f97316"} strokeWidth={2} fill="url(#eqG)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Symbol performance */}
        <div className="card au d4 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[12px] font-bold text-text">Top Symbols</div>
              <div className="text-[11px] text-text3 mt-0.5">PnL per instrumen</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {symData.map(s => {
              const maxAbs = Math.max(...symData.map(x => Math.abs(x.pnl)), 1);
              const w = Math.abs(s.pnl) / maxAbs * 100;
              const up = s.pnl >= 0;
              return (
                <div key={s.symbol}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[12.5px] font-bold text-text">{s.symbol}</span>
                    <span className={`text-[13px] font-bold ${up ? "text-green" : "text-red"}`}>
                      {up ? "+" : "-"}${Math.abs(s.pnl).toFixed(0)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ease-out ${up ? "bg-blue" : "bg-orange"}`} style={{ width: `${w}%` }} />
                  </div>
                </div>
              );
            })}
            {symData.length === 0 && <p className="text-center text-text3 text-[13px] py-5">Belum ada data.</p>}
          </div>
        </div>
      </div>



      {/* â”€â”€ ROW 4: Monthly bars + Hourly + Session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-[1fr_260px_260px] gap-3.5 mb-3.5">

        {/* Monthly / Weekly flip card */}
        <div
          className="flip-card au d5 cursor-pointer"
          onClick={() => setFlippedCard(f => !f)}
          title={flippedCard ? "Klik untuk lihat Monthly" : "Klik untuk lihat Weekly"}
        >
          <div className={`flip-card-inner${flippedCard ? " flipped" : ""}`}>

            {/* FRONT — Monthly */}
            <div className="flip-card-front card p-5">
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-[12px] font-bold text-text">Monthly Performance</div>
                <span className="text-[9px] text-text3 bg-surface2 border border-border rounded-full px-2 py-0.5 font-medium">↻ Weekly</span>
              </div>
              <div className="text-[11px] text-text3 mb-4">PnL per bulan</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthlyData} barSize={14} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={46} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CTip />} />
                  <Bar dataKey="pnl" radius={[5, 5, 0, 0]}>
                    {monthlyData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#2563eb" : "#f97316"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* BACK — Weekly */}
            <div className="flip-card-back card p-5">
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-[12px] font-bold text-text">Weekly Performance</div>
                <span className="text-[9px] text-text3 bg-surface2 border border-border rounded-full px-2 py-0.5 font-medium">↻ Monthly</span>
              </div>
              <div className="text-[11px] text-text3 mb-4">PnL per minggu (16 minggu terakhir)</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyData} barSize={10} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} interval={0} angle={-30} dy={6} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={46} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CTip />} />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {weeklyData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#4f81c7" : "#b0793a"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        </div>

        {/* Hourly performance widget */}
        <div className="card au d6 p-5 pr-2.5">
          <div className="flex justify-between items-start pr-2.5 mb-4">
            <div className="text-[12px] font-bold text-text">Hourly</div>
          </div>
          <div className="flex flex-col gap-1 pr-2.5 overflow-y-auto max-h-[200px] scrollbar-thin">
            {hourlyData.map(([hour, data]) => {
              const maxAbs = Math.max(...hourlyData.map(([, d]) => Math.abs(d.pnl)), 1);
              const w = Math.abs(data.pnl) / maxAbs * 100;
              const winRate = data.count > 0 ? (data.wins / data.count) * 100 : 0;
              const isProfit = data.pnl > 0;
              const isBE = data.pnl === 0;

              return (
                <div key={hour} className="border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[11px] font-medium text-text">{hour}:00</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-bold text-text">
                        {data.pnl < 0 ? "-" : ""}${Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-text3 font-medium min-w-[32px] text-right">{winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-[3px] bg-surface3 rounded-full overflow-hidden">
                    {!isBE && (
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${isProfit ? "bg-green" : "bg-red"}`}
                        style={{ width: `${w}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {hourlyData.length === 0 && <p className="text-center text-text3 text-[12px] py-4">No data.</p>}
          </div>
        </div>

        {/* Trading session */}
        <div className="card au d6 p-5">
          <div className="text-[12px] font-bold text-text mb-0.5">Sessions</div>
          <div className="text-[11px] text-text3 mb-4">Distribusi sesi trading</div>
          <div className="flex flex-col gap-3">
            {sessData.map(([sess, n]) => {
              const w = (n / sessTotal) * 100;
              const meta = SESSION_META[sess];
              return (
                <div key={sess}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-text2">{meta?.label ?? sess}</span>
                      {meta?.hours && <span className="text-[9px] text-text3 font-medium opacity-70">{meta.hours}</span>}
                    </div>
                    <span className="text-xs font-bold text-text font-mono">{n}</span>
                  </div>
                  <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${w}%`, background: meta?.color ?? "#6b7280" }} />
                  </div>
                </div>
              );
            })}
            {sessData.length === 0 && <p className="text-center text-text3 text-[13px] py-4">No data.</p>}
          </div>
        </div>
      </div>
      {/* â”€â”€ AI Analyst Modal â”€â”€ */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-surface/80 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
          <div className="bg-surface2 border border-border w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-xl overflow-hidden relative">
            <div className="p-5 border-b border-border flex justify-between items-center bg-surface shrink-0">
              <h2 className="text-[16px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 12 2.1 12" /><path d="M12 12 21.9 12" /><path d="M12 12 12 21.9" /><path d="M12 12 12 2.1" /></svg>
                AI Analyst
              </h2>
              <button onClick={() => setIsAiModalOpen(false)} className="w-8 h-8 rounded-full bg-surface3 flex flex-col items-center justify-center hover:bg-surface3/80 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto scrollbar-thin flex flex-col items-center">
              {!aiInsights && !isGeneratingAI && (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4 flex-1">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4 text-accent">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 12 2.1 12" /><path d="M12 12 21.9 12" /><path d="M12 12 12 21.9" /><path d="M12 12 12 2.1" /></svg>
                  </div>
                  <h3 className="text-[15px] font-bold text-text mb-2">Evaluasi Performa Terkini</h3>
                  <p className="text-[13px] text-text3 mb-6 max-w-sm">
                    AI Analyst akan membaca rasio kemenangan, PnL per instrumen, streak, dan histori psikologismu untuk memberikan _insights_ objektif secara *real-time*.
                  </p>
                  <button
                    onClick={generateAIInsights}
                    disabled={closed.length === 0}
                    className="flex items-center gap-2 bg-text text-bg px-5 py-2.5 rounded-full text-[13px] font-bold shadow-md hover:scale-105 hover:bg-accent hover:text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="2" x2="12" y2="12" /><line x1="12" y1="12" x2="22" y2="12" /><path d="M12 22a10 10 0 1 1 10-10" /></svg>
                    Mulai Auto-Analisis
                  </button>
                  {closed.length === 0 && <span className="text-[11px] text-red mt-3">Belum ada riwayat profit/loss terekam.</span>}
                </div>
              )}

              {isGeneratingAI && (
                <div className="flex flex-col items-center justify-center py-20 flex-1 gap-6">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"></div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[13px] font-bold text-text tracking-wide animate-pulse">Mengevaluasi Emosi & Performa...</span>
                    <span className="text-[11px] text-text3 font-medium">Ini hanya membutuhkan beberapa detik</span>
                  </div>
                </div>
              )}

              {aiInsights && !isGeneratingAI && (
                <div className="w-full bg-white border border-border rounded-xl p-6 text-[13.5px] text-text2 leading-relaxed prose prose-sm prose-p:my-2 prose-ul:my-2 prose-li:my-1 max-w-none animate-in slide-in-from-bottom-2 fade-in">
                  <ReactMarkdown>{aiInsights}</ReactMarkdown>
                </div>
              )}
            </div>
            {aiInsights && !isGeneratingAI && (
              <div className="p-4 border-t border-border bg-surface flex justify-end shrink-0">
                <button onClick={generateAIInsights} className="text-[12px] font-bold text-text2 bg-surface2 border border-border hover:bg-surface3 px-4 py-2 flex items-center gap-2 rounded-full cursor-pointer transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
