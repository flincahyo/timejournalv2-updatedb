"use client";
import { useMemo, useState } from "react";
import { useFilteredTrades } from "@/store";
import { fmtUSD } from "@/lib/utils";
import EditTradeModal from "@/components/modals/EditTradeModal";
import { Trade } from "@/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const { filtered: trades } = useFilteredTrades();
  const [yr, setYr] = useState(new Date().getFullYear());
  const [mo, setMo] = useState(new Date().getMonth());
  const [sel, setSel] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  const pnlByDate = useMemo(() => {
    const m: Record<string, { pnl: number; count: number; wins: number }> = {};
    trades.forEach(t => {
      const d = t.openTimeWIB?.slice(0, 10);
      if (!d) return;
      if (!m[d]) m[d] = { pnl: 0, count: 0, wins: 0 };
      m[d].pnl += t.pnl;
      m[d].count++;
      if (t.pnl > 0) m[d].wins++;
    });
    return m;
  }, [trades]);

  const days = new Date(yr, mo + 1, 0).getDate();
  const first = new Date(yr, mo, 1).getDay();
  // Get true WIB local date string
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const selTrades = sel ? trades.filter(t => t.openTimeWIB?.slice(0, 10) === sel) : [];

  const weeklyStats = useMemo(() => {
    const weeks = Array.from({ length: 5 }, () => ({
      trades: 0, wins: 0, losses: 0, pnl: 0, grossWin: 0, grossLoss: 0,
      best: 0, worst: 0
    }));

    trades.forEach(t => {
      if (!t.openTimeWIB) return;
      const d = new Date(t.openTimeWIB.slice(0, 10));
      if (d.getFullYear() !== yr || d.getMonth() !== mo) return;

      const dayIdx = d.getDate();
      // Bucket into weeks (1-7, 8-14, 15-21, 22-28, 29+)
      const wIdx = Math.min(Math.floor((dayIdx - 1) / 7), 4);

      weeks[wIdx].trades++;
      weeks[wIdx].pnl += t.pnl;
      if (t.pnl > 0) {
        weeks[wIdx].wins++;
        weeks[wIdx].grossWin += t.pnl;
        if (t.pnl > weeks[wIdx].best) weeks[wIdx].best = t.pnl;
      } else if (t.pnl < 0) {
        weeks[wIdx].losses++;
        weeks[wIdx].grossLoss += Math.abs(t.pnl);
        if (t.pnl < weeks[wIdx].worst) weeks[wIdx].worst = t.pnl;
      }
    });

    const labels = ["First Week", "Second Week", "Third Week", "Fourth Week", "Fifth Week"];
    const rows = weeks.map((w, i) => ({
      label: labels[i],
      trades: w.trades,
      winRate: w.trades ? (w.wins / w.trades) * 100 : 0,
      avgGain: w.wins ? w.grossWin / w.wins : 0,
      avgLoss: w.losses ? w.grossLoss / w.losses : 0,
      biggestGain: w.best,
      biggestLoss: w.worst,
      pnl: w.pnl
    }));

    const totalStats = {
      label: "Total",
      trades: rows.reduce((a, r) => a + r.trades, 0),
      pnl: rows.reduce((a, r) => a + r.pnl, 0),
      best: Math.max(...rows.map(r => r.biggestGain)),
      worst: Math.min(...rows.map(r => r.biggestLoss)),
      totalWins: weeks.reduce((a, w) => a + w.wins, 0),
      totalLosses: weeks.reduce((a, w) => a + w.losses, 0),
      totalGrossWin: weeks.reduce((a, w) => a + w.grossWin, 0),
      totalGrossLoss: weeks.reduce((a, w) => a + w.grossLoss, 0),
    };

    const avg = {
      label: "Average",
      trades: totalStats.trades / 5,
      winRate: totalStats.trades ? (totalStats.totalWins / totalStats.trades) * 100 : 0,
      avgGain: totalStats.totalWins ? totalStats.totalGrossWin / totalStats.totalWins : 0,
      avgLoss: totalStats.totalLosses ? totalStats.totalGrossLoss / totalStats.totalLosses : 0,
      biggestGain: totalStats.best,
      biggestLoss: totalStats.worst,
      pnl: totalStats.pnl / 5
    };

    const total = {
      ...avg,
      label: "Total",
      trades: totalStats.trades,
      pnl: totalStats.pnl
    };

    return { rows, avg, total };
  }, [trades, yr, mo]);

  const nav = (dir: number) => {
    const d = new Date(yr, mo + dir);
    setYr(d.getFullYear()); setMo(d.getMonth());
  };

  return (
    <div className="fade-in flex flex-col gap-4 p-7 pb-10">
      <div className="flex items-center justify-between mb-1">
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1.5 text-[18px] font-bold text-text hover:text-accent transition-colors"
          >
            {MONTHS[mo]} {yr}
            <span className="text-[12px] opacity-60">▼</span>
          </button>

          {showPicker && (
            <>
              {/* Invisible backdrop to close on click outside */}
              <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)}></div>

              <div className="absolute top-full mb-2 left-0 mt-2 p-3 bg-surface border border-border rounded-lg shadow-sm z-50 w-64 fade-in">
                <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
                  <button onClick={() => setYr(y => y - 1)} className="px-2 py-1 hover:bg-surface2 rounded text-text2">‹</button>
                  <div className="font-bold text-[14px] text-text">{yr}</div>
                  <button onClick={() => setYr(y => y + 1)} className="px-2 py-1 hover:bg-surface2 rounded text-text2">›</button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {MONTHS.map((m, i) => (
                    <button
                      key={m}
                      onClick={() => { setMo(i); setShowPicker(false); }}
                      className={`py-1.5 text-[12px] rounded transition-colors ${mo === i ? 'bg-text text-surface font-bold' : 'hover:bg-surface2 text-text2 hover:text-text'}`}
                    >
                      {m.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav(-1)} className="btn-outline py-1.5 px-3.5 text-[15px]">‹</button>
          <button onClick={() => { setYr(new Date().getFullYear()); setMo(new Date().getMonth()); }} className="btn-outline py-1.5 px-3 text-xs">Today</button>
          <button onClick={() => nav(1)} className="btn-outline py-1.5 px-3.5 text-[15px]">›</button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="text-center text-[11px] text-text3 py-1.5 font-semibold tracking-[.04em]">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const ds = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = pnlByDate[ds];
          const isToday = ds === today;
          const isSel = sel === ds;
          const isWknd = [0, 6].includes(new Date(yr, mo, day).getDay());
          return (
            <div key={day} onClick={() => setSel(isSel ? null : ds)} className={`rounded-lg py-2 px-2 min-h-[60px] cursor-pointer transition-all duration-150 ${isSel ? 'bg-accent3 border-accent' : `bg-surface border ${isToday ? 'border-indigo-500/50' : 'border-border'} hover:border-accent`} ${isWknd && !data ? 'opacity-45' : 'opacity-100'} border`}
            >
              <div className={`text-xs mb-1.5 ${isToday ? 'text-accent2 font-bold' : isSel ? 'text-accent2' : 'text-text3 font-normal'}`}>{day}</div>
              {data && (
                <>
                  <div className={`text-[9px] font-bold py-0.5 px-1.5 rounded-[3px] inline-block mb-0.5 ${data.pnl >= 0 ? 'bg-green-bg text-green' : 'bg-red-bg text-red'}`}>
                    {data.pnl >= 0 ? "+" : "-"}${Math.abs(data.pnl).toFixed(0)}
                  </div>
                  <div className="text-[9px] text-text3">{data.count} trade{data.count !== 1 ? "s" : ""}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Data Panes Container (Cross-fade) */}
      <div className="relative w-full mt-2 min-h-[435px]">

        {/* Weekly Info Pane */}
        <div
          className={`absolute inset-0 card shadow-sm border border-border p-0 overflow-hidden transition-all duration-300 ease-out ${!sel ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'
            }`}
        >
          <div className="p-5 border-b border-border bg-surface2/30">
            <h3 className="text-[13.5px] font-bold text-text">Weekly Info</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-[9px] uppercase tracking-[.05em] text-text3 font-medium bg-surface/50">
                  <th className="py-2.5 px-5 font-medium whitespace-nowrap">Week</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Trades</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Win %</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Avg Gain</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Avg Loss</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Biggest Gain</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Biggest Loss</th>
                  <th className="py-2.5 px-5 text-right font-medium whitespace-nowrap">PNL</th>
                </tr>
              </thead>
              <tbody>
                {[...weeklyStats.rows, weeklyStats.avg, weeklyStats.total].map((r, i) => {
                  const isSummary = r.label === "Average" || r.label === "Total";
                  const isTotal = r.label === "Total";
                  return (
                    <tr key={r.label} className={`border-b border-border/40 dark:border-white/[0.03] transition-colors ${isTotal ? 'bg-surface2/80 font-bold' : isSummary ? 'bg-surface/40' : 'hover:bg-surface3/30'}`}>
                      <td className={`py-3 px-5 text-[11px] whitespace-nowrap ${isSummary ? 'font-bold text-text' : 'font-semibold text-text2'}`}>{r.label}</td>
                      <td className="py-3 px-3 text-[11px] font-mono text-text3">{r.trades > 0 || isSummary ? Number(r.trades).toFixed(isTotal ? 0 : 1) : '-'}</td>
                      <td className={`py-3 px-3 text-[11px] font-mono ${r.trades > 0 || isSummary ? (r.winRate >= 50 ? 'text-green' : 'text-red') : 'text-text3'}`}>
                        {r.trades > 0 || isSummary ? `${r.winRate.toFixed(1)}%` : '-'}
                      </td>
                      <td className="py-3 px-3 text-[11px] font-mono text-green">{r.trades > 0 || isSummary ? fmtUSD(r.avgGain) : '-'}</td>
                      <td className="py-3 px-3 text-[11px] font-mono text-red">{r.trades > 0 || isSummary ? `-${fmtUSD(r.avgLoss)}` : '-'}</td>
                      <td className="py-3 px-3 text-[11px] font-mono text-text3">{r.trades > 0 || isSummary ? fmtUSD(r.biggestGain) : '-'}</td>
                      <td className="py-3 px-3 text-[11px] font-mono text-text3">{r.trades > 0 || isSummary ? fmtUSD(Math.abs(r.biggestLoss)) : '-'}</td>
                      <td className={`py-3 px-5 text-right text-[11.5px] font-mono whitespace-nowrap font-bold ${r.pnl > 0 ? 'text-green' : r.pnl < 0 ? 'text-red' : 'text-text3'}`}>
                        {r.trades > 0 || isSummary ? fmtUSD(r.pnl) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected day trades Pane */}
        <div
          className={`absolute inset-0 card shadow-sm border border-border p-0 overflow-hidden flex flex-col transition-all duration-300 ease-out ${sel ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'
            }`}
        >
          <div className="flex items-center justify-between p-5 border-b border-border bg-surface2/50 shrink-0">
            <h3 className="text-[13.5px] font-bold text-text flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); setSel(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface3 text-text3 hover:text-text transition-colors"
                title="Back to Weekly Info"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              Trades on {sel}
            </h3>
            {selTrades.length > 0 && (
              <div className={`text-[12.5px] font-bold px-3 py-1 rounded-full ${selTrades.reduce((a, t) => a + t.pnl, 0) >= 0 ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                Total: {fmtUSD(selTrades.reduce((a, t) => a + t.pnl, 0))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-thin rounded-b-xl">
            {selTrades.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 shadow-sm after:absolute after:inset-x-0 after:bottom-0 after:h-[1px] after:bg-border">
                  <tr className="bg-surface2/95 backdrop-blur-md">
                    <th className="py-1.5 px-3 w-24 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">TIME</th>
                    <th className="py-1.5 px-3 w-[15%] text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">SYMBOL</th>
                    <th className="py-1.5 px-3 w-20 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">TYPE</th>
                    <th className="py-1.5 px-3 w-20 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">LOTS</th>
                    <th className="py-1.5 px-3 w-full text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">SETUP</th>
                    <th className="py-1.5 px-3 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">SESSION</th>
                    <th className="py-1.5 px-3 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">CLOSE TYPE</th>
                    <th className="py-1.5 px-3 w-24 text-right text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">PIPS</th>
                    <th className="py-1.5 px-3 w-28 text-right text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">PNL</th>
                    <th className="py-1.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {selTrades.map((t, idx) => (
                    <tr
                      key={t.id}
                      className="hover:bg-surface3/50 transition-colors border-b border-border/40 dark:border-white/[0.03] last:border-0 group"
                      style={{ transitionDelay: `${idx * 20}ms` }}
                    >
                      <td className="py-2 px-3 text-[10px] text-text3 font-mono whitespace-nowrap">
                        {t.openTimeWIB?.slice(11, 16)} <span className="text-[9px] opacity-70 ml-0.5">WIB</span>
                      </td>
                      <td className="py-2 px-3 font-bold text-[10.5px] text-text tracking-wide whitespace-nowrap">{t.symbol}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded-[3px] font-mono font-bold text-[9px] tracking-wide uppercase ${t.type.toUpperCase() === "BUY" ? "bg-blue-bg text-blue" : "bg-red-bg text-red"}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[10.5px] text-text font-mono whitespace-nowrap">{t.lots}</td>
                      <td className="py-2 px-3 min-w-[120px] max-w-[200px] align-top">
                        <div className="flex flex-col gap-1 whitespace-normal">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10.5px] font-semibold text-text2">{t.setup === "MT5 Import" ? "-" : (t.setup || "-")}</span>
                            {t.emotion && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface3 text-text3 border border-border mt-0.5">{t.emotion}</span>}
                          </div>
                          {t.tags && t.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {t.tags.map((tag: string) => (
                                <span key={tag} className="text-[8.5px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium leading-none">{tag}</span>
                              ))}
                            </div>
                          )}
                          {t.note && <div className="text-[9.5px] text-text3 line-clamp-2 italic mt-0.5 leading-snug" title={t.note}>"{t.note}"</div>}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[10px] text-text2 whitespace-nowrap align-top">{t.session}</td>
                      <td className="py-2 px-3 whitespace-nowrap align-top">
                        <span className={`text-[8.5px] font-bold py-1 px-1.5 rounded-[4px] uppercase ${t.closeType === "target_hit" ? 'bg-green-bg text-green' : t.closeType === "stopped_out" ? 'bg-red-bg text-red' : 'bg-surface3 text-text3'}`}>
                          {t.closeType?.replace("_", " ")}
                        </span>
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-medium text-[10.5px] whitespace-nowrap align-top ${t.pips >= 0 ? 'text-green' : 'text-red'}`}>
                        {t.pips != null && !isNaN(t.pips) ? `${t.pips > 0 ? "+" : ""}${Number(t.pips).toFixed(1)}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap align-top">
                        <span className={`inline-block px-1.5 py-0.5 rounded-[3px] font-mono font-bold text-[10px] tracking-wide ${t.pnl >= 0 ? 'bg-green-bg text-green border border-green-br' : 'bg-red-bg text-red border border-red-br'}`}>
                          {fmtUSD(t.pnl)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right opacity-0 group-hover:opacity-100 transition-opacity align-top">
                        <button onClick={() => setEditingTrade(t as Trade)} className="w-5 h-5 rounded flex items-center justify-center text-text3 hover:text-accent hover:bg-accent-s transition-colors" title="Edit Trade">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-full text-text3 text-[12px] font-medium p-10">
                No trades recorded for {sel}.
              </div>
            )}
          </div>
        </div>
      </div>
      {editingTrade && <EditTradeModal trade={editingTrade} onClose={() => setEditingTrade(null)} />}
    </div>
  );
}
