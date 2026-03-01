"use client";
import { useMemo, useState } from "react";
import { useFilteredTrades, useFilterStore, useJournalStore } from "@/store";
import { fmtUSD } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine } from "recharts";
import EditTradeModal from "@/components/modals/EditTradeModal";
import { Trade } from "@/types";

export default function JournalPage() {
  const { filtered } = useFilteredTrades();
  const { filter, setFilter } = useFilterStore();
  const { notes, tags, dailyTags, setNote, toggleDailyTag, addTag, removeTag } = useJournalStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedTrades, setExpandedTrades] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagVal, setNewTagVal] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  const insertTemplate = (day: string) => {
    const tpl = "- Market Context: \n- What went well: \n- What to improve: ";
    const current = notes[day] || "";
    setNote(day, current + (current ? "\n\n" : "") + tpl);
  };

  const toggleDay = (day: string) => setExpanded(p => ({ ...p, [day]: !p[day] }));

  const closed = useMemo(() => filtered.filter(t => t.status === "closed"), [filtered]);

  // Group by day
  const dailyData = useMemo(() => {
    const map: Record<string, any> = {};
    closed.forEach(t => {
      const day = t.openTimeWIB?.slice(0, 10);
      if (!day) return;
      if (!map[day]) {
        // Construct standard date string manually to avoid timezone shifting issues
        const [y, m, d] = day.split('-');
        const dObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        map[day] = {
          dateStr: dObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
          dateObj: dObj,
          trades: [],
          pnl: 0,
          volume: 0,
          wins: 0,
          commissions: 0,
          timeline: []
        };
      }
      map[day].trades.push(t);
      map[day].pnl += t.pnl;
      map[day].volume += t.lots;
      map[day].commissions += Math.abs(t.commission || 0) + Math.abs(t.swap || 0);
      if (t.pnl > 0) map[day].wins++;
    });

    return Object.entries(map)
      .sort((a, b) => b[1].dateObj.getTime() - a[1].dateObj.getTime())
      .filter(([day, data]: [string, any]) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const note = (notes[day] || "").toLowerCase();
        const tagMatch = (dailyTags[day] || []).some(t => t.toLowerCase().includes(q));
        const symMatch = data.trades.some((t: any) => t.symbol.toLowerCase().includes(q));
        return note.includes(q) || tagMatch || symMatch;
      })
      .map(([day, data]) => {
        // build timeline (chronological)
        let run = 0;
        // MT5 store sorts reverse chronological usually, so we reverse to get forward time
        const forwardTrades = [...data.trades].reverse();
        const timeline = forwardTrades.map((t, i) => {
          run += t.pnl;
          return { i, val: run };
        });
        timeline.unshift({ i: -1, val: 0 }); // start at zero

        const wins = data.trades.filter((t: any) => t.pnl > 0);
        const losses = data.trades.filter((t: any) => t.pnl < 0);
        const bestTrade = data.trades.length ? Math.max(...data.trades.map((t: any) => t.pnl)) : 0;
        const worstTrade = data.trades.length ? Math.min(...data.trades.map((t: any) => t.pnl)) : 0;
        const avgWin = wins.length ? wins.reduce((a: any, b: any) => a + b.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length ? losses.reduce((a: any, b: any) => a + Math.abs(b.pnl), 0) / losses.length : 0;

        return {
          day,
          ...data,
          timeline,
          winrate: data.trades.length ? data.wins / data.trades.length : 0,
          bestTrade, worstTrade, avgWin, avgLoss
        };
      });
  }, [closed]);

  return (
    <div className="fade-in p-4 md:p-7 pb-10 max-w-[1240px] mx-auto flex flex-col h-[calc(100vh-var(--topbar-h))] md:h-auto overflow-hidden md:overflow-visible">
      {/* Header & Filters */}
      <h1 className="text-2xl font-extrabold text-text tracking-[-0.8px] leading-tight mb-5 shrink-0">Journal</h1>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6 shrink-0">
        <div className="flex flex-col gap-1.5 w-full md:w-[220px]">
          <label className="text-[11px] font-semibold text-text3 tracking-[.02em]">Search Journal</label>
          <input
            type="text"
            placeholder="Search notes, tags, or symbols..."
            className="input px-4 h-[42px] text-[13px] bg-white text-text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 w-full md:w-[160px]">
          <label className="text-[11px] font-semibold text-text3 tracking-[.02em]">Side</label>
          <select
            className="input px-4 h-[42px] text-[13px] bg-surface2 border-border text-text"
            value={filter.side}
            onChange={e => setFilter({ side: e.target.value as any })}
          >
            <option value="all">All Sides</option>
            <option value="buy">Long</option>
            <option value="sell">Short</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col-reverse lg:grid lg:grid-cols-[1fr_260px] gap-5 flex-1 min-h-0 overflow-hidden md:overflow-visible">

        {/* Main Timeline Column */}
        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-thin lg:overflow-visible">
          {dailyData.length === 0 && (
            <div className="card p-12 text-center text-text3 text-[13px]">Belum ada riwayat trade.</div>
          )}

          {dailyData.map((d, i) => {
            // Open first card by default if none specified
            const isExp = expanded[d.day] !== undefined ? expanded[d.day] : i === 0;
            const isPos = d.pnl >= 0;
            const color = isPos ? "#10b981" : "#f43f5e"; // green / rose

            return (
              <div key={d.day} className="card au bg-white shadow-s1 overflow-hidden transition-all duration-200 border-border">
                {/* Card Header */}
                <div
                  className="flex items-center justify-between p-4 px-5 cursor-pointer hover:bg-surface2/50 transition-colors"
                  onClick={() => toggleDay(d.day)}
                >
                  <div className="flex items-center gap-3">
                    <button className="w-7 h-7 rounded border border-border flex items-center justify-center text-text3 bg-surface2 hover:bg-surface3 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${isExp ? 'rotate-180' : ''}`}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <h2 className="text-[17px] font-bold text-text tracking-[-0.4px]">{d.dateStr}</h2>
                  </div>
                  <div className="flex items-center gap-4 pr-1">
                    <div className="text-[12.5px] font-bold text-text3 flex items-center gap-1.5">
                      P&L: <span className={isPos ? "text-green" : "text-red"}>{fmtUSD(d.pnl)}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExp && (
                  <div className="px-5 pb-5 pt-2 border-t border-border/50 fade-in">

                    {/* Top Row: Mini Chart & Metrics Grid */}
                    <div className="flex flex-col md:grid md:grid-cols-[200px_1fr] gap-4 md:gap-8 mb-5">

                      {/* Mini Area Chart */}
                      <div className="h-[120px] pt-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={d.timeline} margin={{ top: 5, right: 0, bottom: 0, left: -25 }}>
                            <defs>
                              <linearGradient id={`color-${d.day}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                            <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} tickCount={4} />
                            <Area type="monotone" dataKey="val" stroke={color} strokeWidth={2} fill={`url(#color-${d.day})`} isAnimationActive={false} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Metrics 3x2 Grid */}
                      <div className="grid grid-cols-3 md:grid-cols-3 gap-y-4 gap-x-6 py-2">
                        <div
                          className="flex flex-col cursor-pointer hover:bg-surface2/50 rounded p-1 -m-1 transition-colors"
                          onClick={() => setExpandedTrades(p => ({ ...p, [d.day]: !p[d.day] }))}
                          title="Click to toggle trades list"
                        >
                          <span className="text-[12px] font-semibold text-text3 mb-1 flex items-center gap-1.5">
                            Trades
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${expandedTrades[d.day] ? 'rotate-180 text-accent' : ''}`}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                          <span className="text-[14px] font-bold text-text">{d.trades.length}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-text3 mb-1">Winrate</span>
                          <span className="text-[14px] font-bold text-text">{(d.winrate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-text3 mb-1">Best Trade</span>
                          <span className="text-[14px] font-bold text-green">{fmtUSD(d.bestTrade)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-text3 mb-1">Worst Trade</span>
                          <span className="text-[14px] font-bold text-red">{fmtUSD(d.worstTrade)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-text3 mb-1">Avg Win</span>
                          <span className="text-[14px] font-bold text-green">{fmtUSD(d.avgWin)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-text3 mb-1">Avg Loss</span>
                          <span className="text-[14px] font-bold text-red">-{fmtUSD(d.avgLoss)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Rich text area replacement */}
                    <div className="relative">
                      <textarea
                        className="w-full min-h-[100px] rounded-lg border border-border bg-surface/30 p-4 text-[13px] text-text placeholder:text-text3/60 focus:outline-none focus:border-accent resize-y"
                        placeholder={`${d.dateStr} - write your notes here...`}
                        value={notes[d.day] || ""}
                        onChange={(e) => setNote(d.day, e.target.value)}
                      />
                      <div className="absolute bottom-3 right-3 flex gap-2">
                        {notes[d.day] && (
                          <button
                            className="bg-red-bg text-red font-semibold text-[11.5px] py-1.5 px-3 rounded opacity-0 group-hover:opacity-100 transition-opacity absolute right-[100%] mr-2 hover:bg-red hover:text-white"
                            onClick={() => setNote(d.day, "")}
                          >
                            Clear
                          </button>
                        )}
                        <button
                          onClick={() => insertTemplate(d.day)}
                          className="bg-surface border text-text font-semibold text-[11.5px] border-border py-1.5 px-3 rounded shadow-sm hover:bg-surface2 transition-colors"
                        >
                          Insert template
                        </button>
                      </div>
                    </div>

                    {/* Quick Tags */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map(tag => {
                        const hasTag = (dailyTags[d.day] || []).includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleDailyTag(d.day, tag)}
                            className={`text-[10.5px] font-bold px-3 py-1.5 rounded-full border transition-colors ${hasTag ? 'bg-accent/10 border-accent/40 text-accent shadow-sm' : 'bg-surface border-border text-text3 hover:text-text hover:bg-surface2'}`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>

                    {/* Daily Trades Table */}
                    {expandedTrades[d.day] && d.trades.length > 0 && (
                      <div className="mt-6 pt-5 border-t border-border/50 fade-in">
                        <h4 className="text-[12px] font-bold text-text mb-3">Trades ({d.trades.length})</h4>
                        <div className="overflow-x-auto overflow-y-auto max-h-[300px] scrollbar-thin border border-border rounded-lg">
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 shadow-sm after:absolute after:inset-x-0 after:bottom-0 after:h-[1px] after:bg-border bg-surface2/95 backdrop-blur-md">
                              <tr>
                                <th className="py-2 px-3 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">Time</th>
                                <th className="py-2 px-3 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">Asset</th>
                                <th className="py-2 px-3 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">Direction</th>
                                <th className="py-2 px-3 text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">Setup</th>
                                <th className="py-2 px-3 text-right text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">Pips</th>
                                <th className="py-2 px-3 text-right text-[9px] uppercase tracking-[.05em] text-text3 font-medium whitespace-nowrap">Net PnL</th>
                                <th className="py-2 px-3"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.trades.map((t: any) => (
                                <tr key={t.id} className="hover:bg-surface3/50 transition-colors border-b border-border/40 dark:border-white/[0.03] last:border-0 group">
                                  <td className="py-2 px-3 text-[10px] text-text3 font-mono whitespace-nowrap">
                                    {t.openTimeWIB?.slice(11, 16)} <span className="text-[9px] opacity-70 ml-0.5">WIB</span>
                                  </td>
                                  <td className="py-2 px-3 font-bold text-[10.5px] text-text tracking-wide whitespace-nowrap">{t.symbol}</td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <span className={`inline-block px-1.5 py-0.5 rounded-[3px] font-mono font-bold text-[9px] tracking-wide uppercase ${t.type.toUpperCase() === "BUY" ? "bg-blue-bg text-blue" : "bg-red-bg text-red"}`}>
                                      {t.type}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 max-w-[150px]">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-semibold text-text2 truncate">{t.setup === "MT5 Import" ? "-" : (t.setup || "-")}</span>
                                        {t.emotion && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface3 text-text3 border border-border">{t.emotion}</span>}
                                      </div>
                                      {t.tags && t.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {t.tags.map((tag: string) => (
                                            <span key={tag} className="text-[8.5px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium leading-none">{tag}</span>
                                          ))}
                                        </div>
                                      )}
                                      {t.note && <div className="text-[9px] text-text3 line-clamp-1 italic mt-0.5" title={t.note}>"{t.note}"</div>}
                                    </div>
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
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="card bg-white p-5 shadow-sm border-border">
            <h3 className="text-[14px] font-bold text-text mb-4">Saved Notes</h3>
            <div className="flex flex-col gap-3.5 mb-5 max-h-[200px] overflow-y-auto scrollbar-thin">
              {Object.entries(notes).filter(([_, text]) => text.trim().length > 0).length === 0 ? (
                <div className="text-[12px] text-text3 italic">No notes written yet.</div>
              ) : (
                Object.entries(notes)
                  .filter(([_, text]) => text.trim().length > 0)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([day, text]) => {
                    const dObj = new Date(day);
                    const label = dObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                    return (
                      <div
                        key={day}
                        className="flex flex-col gap-1 group cursor-pointer relative pr-6"
                        onClick={() => {
                          setExpanded(p => ({ ...p, [day]: true }));
                          window.scrollTo({ top: 0, behavior: 'smooth' }); // quick rudimentary scroll top
                        }}
                      >
                        <div className="flex items-center gap-2 text-[12.5px] font-bold text-text group-hover:text-accent transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                          {label}
                        </div>
                        <div className="text-[11px] text-text3 ml-[28px] line-clamp-4 whitespace-pre-line leading-relaxed pr-2">
                          {text}
                        </div>
                        <button
                          className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red transition-all cursor-pointer text-text3"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm("Delete this note?")) setNote(day, "");
                          }}
                          title="Delete note"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className="card bg-white p-5 shadow-sm border-border">
            <h3 className="text-[14px] font-bold text-text mb-3">Available Tags</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map(tag => (
                <div key={tag} className="flex items-center gap-1 bg-surface2 px-2 py-1.5 rounded-[6px] border border-border/80 group">
                  <span className="text-[11px] font-semibold text-text2 leading-none whitespace-nowrap">
                    {tag}
                  </span>
                  <button
                    onClick={() => removeTag(tag)}
                    className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-text3 hover:text-red hover:bg-red/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Remove ${tag}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}

              {isAddingTag ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newTagVal.trim()) addTag(newTagVal.trim());
                    setNewTagVal("");
                    setIsAddingTag(false);
                  }}
                  className="flex items-center"
                >
                  <input
                    type="text"
                    autoFocus
                    value={newTagVal}
                    onChange={(e) => setNewTagVal(e.target.value)}
                    onBlur={() => {
                      if (newTagVal.trim()) addTag(newTagVal.trim());
                      setNewTagVal("");
                      setIsAddingTag(false);
                    }}
                    placeholder="New tag..."
                    className="h-7 w-[90px] px-2 text-[11px] bg-white border border-accent rounded-[6px] outline-none text-text"
                  />
                </form>
              ) : (
                <button
                  onClick={() => setIsAddingTag(true)}
                  className="flex items-center justify-center h-[26px] w-[26px] rounded-[6px] border border-dashed border-text3/40 text-text3 hover:text-accent hover:border-accent hover:bg-accent/5 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
      {editingTrade && <EditTradeModal trade={editingTrade} onClose={() => setEditingTrade(null)} />}
    </div>
  );
}
