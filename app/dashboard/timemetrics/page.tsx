"use client";
import { useMemo } from "react";
import { useFilteredTrades } from "@/store";
import { formatDuration, fmtUSD } from "@/lib/utils";
import { ComposedChart, Line, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, ReferenceLine } from "recharts";

function ProgressRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-3.5">
      <span className="text-[11px] font-medium text-text2 min-w-[90px]">{label}</span>
      <div className="flex-1 h-[6px] bg-surface2 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm transition-all duration-800 ease-out" style={{ background: color, width: `${Math.min((value / max) * 100, 100)}%` }} />
      </div>
      <span className="text-[11px] font-bold min-w-[36px] text-right" style={{ color }}>{value.toFixed(0)}%</span>
    </div>
  );
}

const BAR_COLORS = { pos: "#22c55e", neg: "#ef4444" };

export default function TimeMetricsPage() {
  const { filtered: trades, stats } = useFilteredTrades();

  const byDow = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const m: Record<string, { pnl: number; count: number; wins: number }> = {};
    days.forEach(d => m[d] = { pnl: 0, count: 0, wins: 0 });
    trades.filter(t => t.status === "closed").forEach(t => {
      const dateStr = t.openTimeWIB?.slice(0, 10);
      if (!dateStr) return;
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(dateStr + "T12:00:00").getDay()];
      if (m[dow]) { m[dow].pnl += t.pnl; m[dow].count++; if (t.pnl > 0) m[dow].wins++; }
    });
    return days.map(d => ({ day: d, pnl: parseFloat(m[d].pnl.toFixed(2)), count: m[d].count, wr: m[d].count ? (m[d].wins / m[d].count * 100) : 0 }));
  }, [trades]);

  const byHour = useMemo(() => {
    const slots = ["0-3", "3-6", "6-9", "9-12", "12-15", "15-18", "18-21", "21-24"];
    const m: Record<string, { pnl: number; count: number }> = {};
    slots.forEach(s => m[s] = { pnl: 0, count: 0 });
    trades.filter(t => t.status === "closed").forEach(t => {
      const wibH = parseInt(t.openTimeWIB?.slice(11, 13) || "0", 10);
      const slot = slots[Math.floor(wibH / 3)];
      if (slot && m[slot]) { m[slot].pnl += t.pnl; m[slot].count++; }
    });
    return slots.map(s => ({ slot: s, pnl: parseFloat(m[s].pnl.toFixed(2)), count: m[s].count }));
  }, [trades]);

  const bySession = useMemo(() => {
    // Basic Forex Sessions mapped to WIB (UTC+7)
    // Asian: 06:00 - 15:00 WIB
    // London: 14:00 - 23:00 WIB
    // NY: 19:00 - 04:00 WIB
    const sessions = [
      { name: "Asian", start: 6, end: 15 },
      { name: "London", start: 14, end: 23 },
      { name: "New York", start: 19, end: 4 } // Wraps around
    ];
    const m: Record<string, { pnl: number; count: number }> = { "Asian": { pnl: 0, count: 0 }, "London": { pnl: 0, count: 0 }, "New York": { pnl: 0, count: 0 } };

    trades.filter(t => t.status === "closed").forEach(t => {
      const wibH = parseInt(t.openTimeWIB?.slice(11, 13) || "0", 10);
      sessions.forEach(s => {
        let inside = false;
        if (s.start < s.end) {
          inside = (wibH >= s.start && wibH < s.end);
        } else {
          inside = (wibH >= s.start || wibH < s.end); // Wrap around midnight
        }
        if (inside) {
          m[s.name].pnl += t.pnl;
          m[s.name].count++;
        }
      });
    });
    return Object.keys(m).map(k => ({ session: k, pnl: parseFloat(m[k].pnl.toFixed(2)), count: m[k].count }));
  }, [trades]);

  const durWins = formatDuration(stats.avgHoldWins);
  const durLoss = formatDuration(stats.avgHoldLosses);
  const durLongs = formatDuration(stats.avgHoldLongs);
  const durShorts = formatDuration(stats.avgHoldShorts);

  const maxDow = Math.max(...byDow.map(d => Math.abs(d.pnl)), 1);

  const bestSession = bySession.reduce((prev, current) => (prev.pnl > current.pnl) ? prev : current, bySession[0]);
  const totalDays = byDow.filter(d => d.count > 0).length || 1;
  const avgTradesPerDay = (trades.length / totalDays).toFixed(1);

  const tooltip = { contentStyle: { background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 } };

  return (
    <div className="fade-in flex flex-col gap-4 p-5">
      {/* Top row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Win-rate by Duration */}
        <div className="card p-4">
          <div className="text-[12px] font-bold text-text mb-3">Win-rate By Hold Duration</div>
          <ProgressRow label="Scalping" value={stats.scalpingWinRate} max={100} color="var(--accent)" />
          <ProgressRow label="Intraday" value={stats.intradayWinRate} max={100} color="var(--accent2)" />
          <ProgressRow label="Multiday" value={stats.multidayWinRate} max={100} color="var(--border2)" />
        </div>

        {/* Avg Hold Time */}
        <div className="card p-4">
          <div className="text-[12px] font-bold text-text mb-3">Average Hold Time</div>
          <div className="flex flex-col gap-2.5">
            {[["Wins", durWins.str], ["Losses", durLoss.str], ["Long Positions", durLongs.str], ["Short Positions", durShorts.str]].map(([lbl, val]) => (
              <div key={lbl} className="flex items-center justify-between text-[11px] font-medium border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                <span className="text-text3">{lbl}</span>
                <span className="text-text font-bold tracking-[0.02em]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Session Stats */}
        <div className="card p-4 bg-surface2/30 border-dashed">
          <div className="text-[12px] font-bold text-text mb-3">Quick Flow Stats</div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[11px] font-medium border-b border-border/50 pb-1.5">
              <span className="text-text3">Most Profitable Session</span>
              <span className="text-green font-bold tracking-[0.02em]">{bestSession.session}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium border-b border-border/50 pb-1.5">
              <span className="text-text3">Average Daily Trades</span>
              <span className="text-text font-bold tracking-[0.02em]">{avgTradesPerDay}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-text3">Most Active Session</span>
              <span className="text-text font-bold tracking-[0.02em]">{bySession.reduce((p, c) => p.count > c.count ? p : c, bySession[0]).session}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-3 gap-3 mt-1">

        {/* Day of Week Combo Chart */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[12px] font-bold text-text">Day of Week</div>
            <span className="text-[9px] text-border2 -mt-[1px] cursor-help" title="Performance by day of week">ⓘ</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart data={byDow} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dy={6} />
              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dx={-5} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dx={5} />
              <Tooltip {...tooltip} formatter={(value: number, name: string) => [name === "pnl" ? `$${value.toFixed(2)}` : value, name === "pnl" ? "PnL" : "Trades"]} cursor={{ fill: "var(--surface3)" }} />
              <ReferenceLine y={0} yAxisId="left" stroke="var(--border)" strokeWidth={1} />
              <Bar yAxisId="left" dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={16} fillOpacity={0.85}>
                {byDow.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "var(--green)" : "var(--red)"} />)}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="count" stroke="var(--pill)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--surface)", strokeWidth: 1.5 }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Sessions Combo Chart */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[12px] font-bold text-text">Market Sessions</div>
            <span className="text-[9px] text-border2 -mt-[1px] cursor-help" title="Performance by overlapping major forex sessions">ⓘ</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart data={bySession} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="session" tick={{ fontSize: 9, fill: "var(--text3)", fontWeight: 600 }} axisLine={false} tickLine={false} dy={6} />
              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dx={-5} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dx={5} />
              <Tooltip {...tooltip} formatter={(value: number, name: string) => [name === "pnl" ? `$${value.toFixed(2)}` : value, name === "pnl" ? "PnL" : "Trades"]} cursor={{ fill: "var(--surface3)" }} />
              <ReferenceLine y={0} yAxisId="left" stroke="var(--border)" strokeWidth={1} />
              <Bar yAxisId="left" dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={24} fillOpacity={0.85}>
                {bySession.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "var(--green)" : "var(--red)"} />)}
              </Bar>
              <Line yAxisId="right" type="step" dataKey="count" stroke="var(--pill)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--surface)", strokeWidth: 1.5 }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Hour of Day Combo Chart - Span full width */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[12px] font-bold text-text">Hour of Day</div>
            <span className="text-[9px] text-border2 -mt-[1px] cursor-help" title="Analytics by hour of day">ⓘ</span>
            <span className="text-[9px] font-bold text-text3 ml-1 tracking-wider">(WIB / UTC+7)</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={byHour} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <XAxis dataKey="slot" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dy={6} />
              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dx={-5} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "var(--text3)" }} axisLine={false} tickLine={false} dx={5} />
              <Tooltip {...tooltip} formatter={(value: number, name: string) => [name === "pnl" ? `$${value.toFixed(2)}` : value, name === "pnl" ? "PnL" : "Trades"]} cursor={{ fill: "var(--surface3)" }} />
              <ReferenceLine y={0} yAxisId="left" stroke="var(--border)" strokeWidth={1} />
              <Bar yAxisId="left" dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={16} fillOpacity={0.85}>
                {byHour.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "var(--green)" : "var(--red)"} />)}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="count" stroke="var(--pill)" strokeWidth={1.5} dot={{ r: 2, fill: "var(--surface)" }} activeDot={{ r: 3.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
