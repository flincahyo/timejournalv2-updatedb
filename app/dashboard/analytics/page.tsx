"use client";
import { useMemo, useState } from "react";
import { useFilteredTrades } from "@/store";
import { fmtUSD, fmtPips, formatDuration } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, ReferenceLine } from "recharts";

type SortKey = "pnl" | "winRate" | "count";
type SortDir = "asc" | "desc";

function MiniProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1 bg-surface3 rounded-sm overflow-hidden mt-1.5">
      <div className="h-full rounded-sm transition-all duration-300 ease-out" style={{ background: color, width: `${Math.min((Math.abs(value) / max) * 100, 100)}%` }} />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface2 rounded-[16px] p-3.5">
      <div className="text-[10px] font-bold text-text3 uppercase tracking-[.05em] mb-1.5">{label}</div>
      <div className="text-[16px] font-bold tracking-[-.3px]" style={{ color }}>{value}</div>
    </div>
  );
}

function AnalysisCard({ title, wins, losses, pnl, avgWin, avgLoss, avgPnl, winColor, lossColor }: {
  title: string; wins: number; losses: number; pnl: number; avgWin: number; avgLoss: number; avgPnl: number;
  winColor?: string; lossColor?: string;
}) {
  const total = wins + losses;
  const wr = total ? (wins / total) * 100 : 0;
  const wc = winColor ?? "#3b82f6";
  const lc = lossColor ?? "#f59e0b";
  return (
    <div className="card p-4">
      <div className="text-[12px] font-bold text-text mb-3">{title}</div>
      <div className="mb-2">
        <div className="flex items-end justify-between mb-1">
          <div className="text-[10px] text-text3 font-medium uppercase tracking-[0.04em]">Win Rate</div>
          <div className="text-[15px] font-extrabold tracking-[-0.4px] leading-none" style={{ color: wr >= 50 ? wc : lc }}>{wr.toFixed(1)}%</div>
        </div>
        <div className="h-[4px] bg-surface3 rounded-[3px] overflow-hidden mb-1.5 relative">
          <div className="absolute left-0 top-0 h-full rounded-[3px] transition-all duration-300 ease-out" style={{ width: `${wr}%`, background: wc }} />
        </div>
        <div className="flex justify-between text-[9px] font-medium text-text3 uppercase tracking-[0.04em] mt-1.5">
          <span><b className="font-bold text-[10px]" style={{ color: wc }}>{wins}</b> Wins</span>
          <span><b className="font-bold text-[10px]" style={{ color: lc }}>{losses}</b> Losses</span>
        </div>
      </div>
      <div className="h-px bg-border my-2.5" />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-text3 text-[9px] uppercase tracking-[0.04em] mb-0.5">PNL</div>
          <div className="font-bold text-[14px] tracking-[-0.3px]" style={{ color: pnl >= 0 ? wc : lc }}>{fmtUSD(pnl)}</div>
          <div className="text-[9px] text-text3 mt-0.5 uppercase tracking-[0.04em]">{fmtUSD(avgPnl)} Avg</div>
        </div>
        <div>
          <div className="text-text3 text-[9px] uppercase tracking-[0.04em] mb-0.5">Avg Win</div>
          <div className="font-bold text-[12px]" style={{ color: wc }}>{fmtUSD(avgWin)}</div>
          <div className="text-text3 text-[9px] uppercase tracking-[0.04em] mt-1 mb-0.5">Avg Loss</div>
          <div className="font-bold text-[12px]" style={{ color: lc }}>-{fmtUSD(avgLoss)}</div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { filtered: trades, stats } = useFilteredTrades();
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showDropdown, setShowDropdown] = useState(false);

  const symData = useMemo(() => {
    return Object.values(stats.symbolStats).sort((a, b) => {
      const av = a[sortKey === "winRate" ? "winRate" : sortKey === "count" ? "count" : "pnl"];
      const bv = b[sortKey === "winRate" ? "winRate" : sortKey === "count" ? "count" : "pnl"];
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [stats.symbolStats, sortKey, sortDir]);

  const maxPnl = Math.max(...symData.map(s => Math.abs(s.pnl)), 1);
  const maxCount = Math.max(...symData.map(s => s.count), 1);

  const closed = trades.filter(t => t.status === "closed");
  const longs = closed.filter(t => t.type === "BUY");
  const shorts = closed.filter(t => t.type === "SELL");
  const longWins = longs.filter(t => t.pnl > 0);
  const longLoss = longs.filter(t => t.pnl < 0);
  const shortWins = shorts.filter(t => t.pnl > 0);
  const shortLoss = shorts.filter(t => t.pnl < 0);
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const bestTrade = Math.max(...closed.map(t => t.pnl), 0);
  const worstTrade = Math.min(...closed.map(t => t.pnl), 0);

  const tooltip = {
    contentStyle: { background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }
  };

  const sortLabels: Record<SortKey, string> = { pnl: "PNL", winRate: "Win rate", count: "Number of Trades" };

  return (
    <div className="fade-in flex flex-col gap-3 p-5 pb-10">

      {/* Quick Edge Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card py-3 px-4 border-l-[3px] border-l-accent2">
          <div className="text-[10px] font-bold text-text3 mb-1 uppercase tracking-[0.05em] flex items-center gap-1">Profit Factor <span className="text-border2 text-[9px] cursor-help" title="Gross Profit / Gross Loss">ⓘ</span></div>
          <div className="text-[18px] font-extrabold tracking-[-0.5px] text-text flex items-end gap-1">
            {stats.profitFactor.toFixed(2)}
            <span className="text-[10px] text-text3 font-medium mb-[3px]">x</span>
          </div>
        </div>
        <div className="card py-3 px-4 border-l-[3px] border-l-green">
          <div className="text-[10px] font-bold text-text3 mb-1 uppercase tracking-[0.05em] flex items-center gap-1">Expectancy <span className="text-border2 text-[9px] cursor-help" title="Average expected PnL per trade">ⓘ</span></div>
          <div className={`text-[18px] font-extrabold tracking-[-0.5px] ${stats.expectedValue >= 0 ? 'text-green' : 'text-red'}`}>
            {fmtUSD(stats.expectedValue)}
          </div>
        </div>
        <div className="card py-3 px-4 border-l-[3px] border-l-blue-500">
          <div className="text-[10px] font-bold text-text3 mb-1 uppercase tracking-[0.05em] flex items-center gap-1">Average RR <span className="text-border2 text-[9px] cursor-help" title="Average Risk/Reward Ratio per trade">ⓘ</span></div>
          <div className="text-[18px] font-extrabold tracking-[-0.5px] text-text flex items-end gap-1">
            <span className="text-[10px] text-text3 font-medium mb-[3px]">1:</span>
            {stats.avgRR.toFixed(2)}
          </div>
        </div>
        <div className="card py-3 px-4 flex flex-col justify-center">
          <div className="flex justify-between items-center text-[11px] font-bold mb-1.5 border-b border-border/50 pb-1">
            <span className="text-text3 uppercase tracking-[0.05em] text-[9px]">Max Win Streak</span>
            <span className="text-green text-[13px]">{stats.longestWinStreak}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] font-bold">
            <span className="text-text3 uppercase tracking-[0.05em] text-[9px]">Max Loss Streak</span>
            <span className="text-red text-[13px]">{stats.longestLossStreak}</span>
          </div>
        </div>
      </div>

      {/* â”€â”€ Stats detail grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card p-5">
        <div className="text-[12px] font-bold text-text mb-3">Statistik Lengkap</div>
        <div className="grid grid-cols-5 gap-2.5">
          <MiniStat label="Avg Win" value={`+$${stats.avgWin.toFixed(2)}`} color="#3b82f6" />
          <MiniStat label="Avg Loss" value={`-$${stats.avgLoss.toFixed(2)}`} color="#f59e0b" />
          <MiniStat label="Best Trade" value={`+$${stats.bestTrade.toFixed(2)}`} color="#6366f1" />
          <MiniStat label="Worst Trade" value={`-$${Math.abs(stats.worstTrade).toFixed(2)}`} color="#f97316" />
          <MiniStat label="Total Fees" value={`-$${Math.abs(stats.totalFees).toFixed(2)}`} color="#94a3b8" />
          <MiniStat label="Win Streak" value={`${stats.longestWinStreak}`} color="#0ea5e9" />
          <MiniStat label="Loss Streak" value={`${stats.longestLossStreak}`} color="#e879f9" />
          <MiniStat label="Avg R:R" value={`${stats.avgRR.toFixed(2)}×`} color={stats.avgRR >= 1 ? "#3b82f6" : "#94a3b8"} />
          <MiniStat label="Best Symbol" value={stats.bestSymbol} color="#10b981" />
          <MiniStat label="Avg Hold" value={formatDuration(stats.avgTradeTimeMs).str} color="#8b5cf6" />
        </div>
      </div>

      {/* Symbol Performance */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12.5px] font-bold text-text">Symbol Performance</div>
          <div className="flex gap-2 relative">
            {/* Sort Key Dropdown */}
            <div className="relative">
              <button onClick={() => setShowDropdown(d => !d)} className="flex items-center gap-1 py-1 px-3 bg-surface2 border border-border rounded-lg text-text2 text-[11px] font-medium">
                {sortLabels[sortKey]} <span>▲</span>
              </button>
              {showDropdown && (
                <div className="absolute top-[110%] right-0 bg-surface border border-border rounded-lg z-[100] min-w-[140px] shadow-s2">
                  {(Object.keys(sortLabels) as SortKey[]).map(k => (
                    <button key={k} onClick={() => { setSortKey(k); setShowDropdown(false); }} className={`block w-full py-2 px-3 text-left text-[11.5px] border-b border-border last:border-0 ${sortKey === k ? 'text-accent2 bg-accent3' : 'text-text2 hover:bg-surface2'}`}>
                      {sortLabels[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Sort Direction */}
            <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} className="flex items-center gap-1 py-1 px-3 bg-surface2 border border-border rounded-lg text-text2 text-[11px]">
              {sortDir === "desc" ? "Decreasing" : "Increasing"} <span>▼</span>
            </button>
          </div>
        </div>

        {symData.length === 0 ? (
          <div className="text-center py-8 text-text3 text-[12px]">No data</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(120, symData.length * 28)}>
              <BarChart data={symData} layout="vertical" margin={{ top: 0, right: 50, left: 50, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={v => sortKey === "pnl" ? `$${v}` : sortKey === "winRate" ? `${v}%` : String(v)} />
                <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10, fill: "var(--text2)" }} width={50} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} formatter={(v: unknown) =>
                  sortKey === "pnl" ? [`$${Number(v).toFixed(2)}`, "PnL"] :
                    sortKey === "winRate" ? [`${Number(v).toFixed(1)}%`, "Win Rate"] :
                      [String(v), "Trades"]
                } cursor={{ fill: "var(--surface3)" }} />
                <ReferenceLine x={0} stroke="var(--border)" />
                <Bar dataKey={sortKey === "winRate" ? "winRate" : sortKey === "count" ? "count" : "pnl"} radius={[0, 2, 2, 0]} maxBarSize={16}>
                  {symData.map((s, i) => (
                    <Cell key={i} fill={
                      sortKey === "count"
                        ? `hsl(${220 + i * 20}, 70%, 58%)`
                        : s.pnl >= 0 ? "#3b82f6" : "#f59e0b"
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Symbol Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Best Symbol Sum", val: fmtUSD(Math.max(...Object.values(stats.symbolStats).map(s => s.pnl), 0)), sub: stats.bestSymbol, color: "#3b82f6" },
          { label: "Worst Symbol Sum", val: fmtUSD(Math.min(...Object.values(stats.symbolStats).map(s => s.pnl), 0)), sub: stats.worstSymbol, color: "#f59e0b" },
          { label: "Best Symbol Avg", val: fmtUSD(Math.max(...Object.values(stats.symbolStats).map(s => s.pnl / s.count), 0)), sub: "avg/trade", color: "#6366f1" },
          { label: "Worst Symbol Avg", val: fmtUSD(Math.min(...Object.values(stats.symbolStats).map(s => s.pnl / s.count), 0)), sub: "avg/trade", color: "#f97316" },
          { label: "Number of Symbols", val: String(stats.numberOfSymbols), sub: "traded", color: "#8b5cf6" },
        ].map(c => (
          <div key={c.label} className="card py-3.5 px-4">
            <div className="text-[10px] font-semibold text-text3 mb-1.5 uppercase tracking-[0.04em] flex items-center gap-1">
              {c.label} <span className="text-border2 text-[9px]">ⓘ</span>
            </div>
            <div className={`text-[18px] font-extrabold tracking-[-0.5px]`} style={{ color: c.color }}>{c.val}</div>
            <div className="text-[10px] text-text3 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Detailed Analysis Cards (Condensed into 1 row) */}
      <div className="grid grid-cols-4 gap-3">
        {/* Largest Win vs Loss */}
        <div className="card p-4">
          <div className="text-[12px] font-bold text-text mb-3">Extremes</div>
          <div className="mb-3">
            <div className="flex justify-between text-[11px] font-medium mb-1.5">
              <span className="text-text3 text-[9px] uppercase tracking-[0.04em]">Largest Win</span>
              <span className="text-[12px]" style={{ color: "#3b82f6", fontWeight: 700 }}>{fmtUSD(bestTrade)}</span>
            </div>
            <MiniProgressBar value={bestTrade} max={Math.max(bestTrade, Math.abs(worstTrade))} color="#3b82f6" />
          </div>
          <div>
            <div className="flex justify-between text-[11px] font-medium mb-1.5 mt-4">
              <span className="text-text3 text-[9px] uppercase tracking-[0.04em]">Largest Loss</span>
              <span className="text-[12px]" style={{ color: "#f59e0b", fontWeight: 700 }}>{fmtUSD(worstTrade)}</span>
            </div>
            <MiniProgressBar value={Math.abs(worstTrade)} max={Math.max(bestTrade, Math.abs(worstTrade))} color="#f59e0b" />
          </div>
        </div>

        {/* Long Analysis */}
        <AnalysisCard
          title="Long Analysis"
          winColor="#3b82f6" lossColor="#f59e0b"
          wins={longWins.length} losses={longLoss.length}
          pnl={longs.reduce((a, t) => a + t.pnl, 0)}
          avgWin={avg(longWins.map(t => t.pnl))}
          avgLoss={avg(longLoss.map(t => Math.abs(t.pnl)))}
          avgPnl={longs.length ? longs.reduce((a, t) => a + t.pnl, 0) / longs.length : 0}
        />

        {/* Short Analysis */}
        <AnalysisCard
          title="Short Analysis"
          winColor="#8b5cf6" lossColor="#f97316"
          wins={shortWins.length} losses={shortLoss.length}
          pnl={shorts.reduce((a, t) => a + t.pnl, 0)}
          avgWin={avg(shortWins.map(t => t.pnl))}
          avgLoss={avg(shortLoss.map(t => Math.abs(t.pnl)))}
          avgPnl={shorts.length ? shorts.reduce((a, t) => a + t.pnl, 0) / shorts.length : 0}
        />

        {/* Long/Short Ratio */}
        <div className="card p-4">
          <div className="text-[12px] font-bold text-text mb-3">Long / Short Ratio</div>
          <div className="mb-3.5 mt-2">
            <div className="flex justify-between text-[11px] font-medium mb-1.5">
              <span className="text-text3">Longs</span>
              <span className="font-bold" style={{ color: "#3b82f6" }}>{longs.length}</span>
            </div>
            <MiniProgressBar value={longs.length} max={Math.max(longs.length + shorts.length, 1)} color="#3b82f6" />
          </div>
          <div>
            <div className="flex justify-between text-[11px] font-medium mb-1.5 mt-4">
              <span className="text-text3">Shorts</span>
              <span className="font-bold" style={{ color: "#8b5cf6" }}>{shorts.length}</span>
            </div>
            <MiniProgressBar value={shorts.length} max={Math.max(longs.length + shorts.length, 1)} color="#8b5cf6" />
          </div>
          <div className="mt-4 text-[10px] font-medium text-text3 text-center bg-surface2 p-1.5 rounded uppercase tracking-[0.04em]">
            {longs.length} Longs Â· {shorts.length} Shorts
          </div>
        </div>
      </div>

      {/* Setup Performance */}
      <div className="card p-4 mt-2">
        <div className="text-[12px] font-bold text-text mb-3">Setup Performance</div>
        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_60px_60px_80px_80px] py-1.5 px-3 text-[9px] font-semibold text-text3 uppercase tracking-[0.05em] border-b border-border bg-surface2 rounded-t-md">
            <div>Setup</div><div>Trades</div><div>WR</div><div>PnL</div><div>Avg Pips</div>
          </div>
          {Object.values(stats.symbolStats).length === 0 ? (
            <div className="p-4 text-center text-text3 text-[11px]">No data</div>
          ) : null}
          {/* Group by setup */}
          {useMemo(() => {
            const m: Record<string, { pnl: number; count: number; wins: number; pips: number }> = {};
            closed.forEach(t => {
              if (!m[t.setup]) m[t.setup] = { pnl: 0, count: 0, wins: 0, pips: 0 };
              m[t.setup].pnl += t.pnl;
              m[t.setup].count++;
              m[t.setup].pips += t.pips || 0;
              if (t.pnl > 0) m[t.setup].wins++;
            });
            return Object.entries(m).sort((a, b) => b[1].count - a[1].count).map(([setup, d]) => (
              <div key={setup} className="grid grid-cols-[1fr_60px_60px_80px_80px] py-2 px-3 border-b border-border text-[11px] transition-colors hover:bg-surface3 last:border-0">
                <span className="text-text font-medium">{setup}</span>
                <span className="text-text3">{d.count}</span>
                <span className={`font-semibold ${d.wins / d.count >= 0.5 ? 'text-[#3b82f6]' : 'text-[#f59e0b]'
                  }`}>{((d.wins / d.count) * 100).toFixed(0)}%</span>
                <span className={`font-semibold tracking-[-0.2px] ${d.pnl >= 0 ? 'text-[#3b82f6]' : 'text-[#f59e0b]'
                  }`}>{fmtUSD(d.pnl)}</span>
                <span className={`font-medium ${d.pips >= 0 ? 'text-[#6366f1]' : 'text-[#f97316]'
                  }`}>{fmtPips(d.pips / d.count)}</span>
              </div>
            ));
          }, [closed])}
        </div>
      </div>
    </div>
  );
}
