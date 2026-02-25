"use client";
import { useMemo, useState } from "react";
import { useFilteredTrades, useMT5Store } from "@/store";
import { fmtUSD, fmtPips } from "@/lib/utils";
import { Trade } from "@/types";
import EditTradeModal from "@/components/modals/EditTradeModal";

type SortKey = keyof Trade;

export default function TradesPage() {
  const { filtered: trades } = useFilteredTrades();
  const { deleteTrade } = useMT5Store();
  const [sortKey, setSortKey] = useState<SortKey>("openTime");
  const [sortDir, setSortDir] = useState(-1);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const PER_PAGE = 50;

  const closed = useMemo(() => {
    let arr = trades.filter(t => t.status === "closed");
    if (search) arr = arr.filter(t =>
      t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
      t.setup?.toLowerCase().includes(search.toLowerCase()) ||
      t.type?.toLowerCase().includes(search.toLowerCase())
    );
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      return typeof av === "number" && typeof bv === "number"
        ? (av - bv) * sortDir
        : String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
    });
    return arr;
  }, [trades, sortKey, sortDir, search]);

  const paginated = closed.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(closed.length / PER_PAGE);

  const sortCol = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => -d);
    else { setSortKey(k); setSortDir(-1); }
  };

  const th = (label: string, k: SortKey) => (
    <th onClick={() => sortCol(k)} className={`py-1.5 px-3 text-left text-[9px] uppercase tracking-[.05em] cursor-pointer whitespace-nowrap select-none font-medium ${sortKey === k ? 'text-accent2 font-bold' : 'text-text3'}`}>
      {label}{sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  // Summary
  const totalPnl = closed.reduce((a, t) => a + t.pnl, 0);
  const totalPips = closed.reduce((a, t) => a + (t.pips || 0), 0);
  const wins = closed.filter(t => t.pnl > 0).length;

  return (
    <div className="fade-in flex flex-col h-[calc(100vh-var(--topbar-h))] p-6 pb-6 overflow-hidden">
      {/* Header */}
      <div className="card shrink-0 p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input className="input w-[280px] h-[34px] text-[12.5px]" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Cari symbol, setup..." />
            <span className="text-[12px] font-semibold text-text3 shrink-0 whitespace-nowrap">{closed.length} Total Trades</span>
          </div>
          <div className="flex gap-5 text-[12px] font-medium bg-surface2 py-1.5 px-3.5 rounded-[8px] border border-border">
            <span>Total PnL: <b className={totalPnl >= 0 ? 'text-green' : 'text-red'}>{fmtUSD(totalPnl)}</b></span>
            <span>Total Pips: <b className={totalPips >= 0 ? 'text-green' : 'text-red'}>{fmtPips(totalPips)}</b></span>
            <span>Win Rate: <b className="text-text font-bold">{closed.length ? (wins / closed.length * 100).toFixed(1) : 0}%</b></span>
          </div>
        </div>
      </div>

      {/* Table Area (Scrollable body, sticky header) */}
      <div className="flex-1 min-h-0 rounded-xl border border-border bg-surface overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-y-auto w-full scrollbar-thin">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 z-20 bg-surface2 shadow-sm after:absolute after:inset-x-0 after:bottom-0 after:h-[1px] after:bg-border">
              <tr>
                {th("Ticket", "ticket")}
                {th("Symbol", "symbol")}
                {th("Type", "type")}
                {th("Lots", "lots")}
                {th("Entry", "openPrice")}
                {th("Exit", "closePrice")}
                {th("Pips", "pips")}
                {th("PnL", "pnl")}
                {th("Setup", "setup")}
                {th("Session", "session")}
                {th("Close Type", "closeType")}
                {th("Open (WIB)", "openTimeWIB")}
                {th("Duration", "durationMs")}
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((t) => (
                <tr key={t.id} className="hover:bg-surface3/50 transition-colors border-b border-border/60 dark:border-white/[0.03] last:border-0 group">
                  <td className="text-[10px] font-mono font-medium text-text3 py-2 px-3">#{t.ticket}</td>
                  <td className="font-bold text-[11.5px] text-text py-2 px-3 tracking-wide">{t.symbol}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-block px-1.5 py-0.5 rounded-[3px] font-mono font-bold text-[9.5px] tracking-[.02em] uppercase ${t.type.toUpperCase() === "BUY" ? "bg-blue-bg text-blue" : "bg-red-bg text-red"}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] font-medium text-text py-2 px-3">{t.lots}</td>
                  <td className="font-mono text-[11px] font-medium text-text2 py-2 px-3">{t.openPrice?.toFixed(5)}</td>
                  <td className="font-mono text-[11px] font-medium text-text2 py-2 px-3">{t.closePrice?.toFixed(5)}</td>
                  <td className={`font-semibold text-[11px] font-mono py-2 px-3 ${t.pips >= 0 ? 'text-green' : 'text-red'}`}>{t.pips >= 0 ? "+" : ""}{t.pips?.toFixed(1)}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-block px-2 py-0.5 rounded-[4px] font-mono font-bold text-[10.5px] tracking-wide ${t.pnl >= 0 ? "bg-green-bg text-green border border-green-br" : "bg-red-bg text-red border border-red-br"}`}>
                      {fmtUSD(t.pnl)}
                    </span>
                  </td>
                  <td className="py-2 px-3 min-w-[120px] max-w-[200px]">
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
                  <td className="text-[11px] font-medium text-text2 py-2 px-3">{t.session}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[9.5px] font-bold py-1 px-1.5 rounded-[4px] uppercase ${t.closeType === "target_hit" ? 'bg-green-bg text-green' : t.closeType === "stopped_out" ? 'bg-red-bg text-red' : 'bg-surface3 text-text3'}`}>
                      {t.closeType?.replace("_", " ")}
                    </span>
                  </td>
                  <td className="text-[10.5px] text-text3 py-2 px-3 font-mono">{t.openTimeWIB?.slice(0, 16)}</td>
                  <td className="text-[10.5px] text-text3 py-2 px-3">
                    {t.durationMs ? (() => {
                      const m = Math.floor(t.durationMs / 60000);
                      return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
                    })() : "-"}
                  </td>
                  <td className="py-2 px-3 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setEditingTrade(t)} className="w-6 h-6 rounded flex items-center justify-center text-text3 hover:text-accent hover:bg-accent-s transition-colors" title="Edit Trade">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                      </button>
                      {(String(t.id).startsWith("manual_") || String(t.ticket).startsWith("manual_")) && (
                        <button onClick={() => { if (confirm('Hapus trade manual ini?')) deleteTrade(t.id); }} className="w-6 h-6 rounded flex items-center justify-center text-text3 hover:text-red hover:bg-red-bg transition-colors" title="Delete Trade">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {paginated.length === 0 && (
            <div className="p-12 text-center text-[13px] text-text3">Tidak ada data</div>
          )}
        </div>
      </div>

      {/* Pagination Container (sticks to bottom) */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-1.5 pt-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} className="btn-outline py-1.5 px-3.5" disabled={page === 0}>‹</button>
          {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => (
            <button key={i} onClick={() => setPage(i)} className={`w-8 h-8 rounded-md text-xs border transition-colors ${i === page ? 'font-bold bg-accent tracking-tighter border-accent text-pill-t shadow-s1' : 'font-normal bg-surface2 border-border text-text3 hover:border-border2'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} className="btn-outline py-1.5 px-3.5" disabled={page === totalPages - 1}>›</button>
        </div>
      )}

      {editingTrade && <EditTradeModal trade={editingTrade} onClose={() => setEditingTrade(null)} />}
    </div>
  );
}
