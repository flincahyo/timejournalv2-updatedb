"use client";
import { useMT5Store } from "@/store";
import { fmtUSD, fmtPips } from "@/lib/utils";

export default function LiveTradesPage() {
  const { liveTrades, account, isConnected } = useMT5Store();

  const totalLivePnl = liveTrades.reduce((a, t) => a + t.pnl, 0);

  if (!isConnected) return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-3.5 opacity-70">
      <div className="text-[40px]">🔌</div>
      <div className="text-[15px] font-bold text-text">Belum Terhubung ke MT5</div>
      <div className="text-[13px] text-text3">Klik "Broker Connections" di topbar untuk konek.</div>
    </div>
  );

  const renderCandles = (isColor: boolean) => (
    <>
      <g className={isColor ? "text-text" : "text-text3"} opacity={isColor ? 1 : 0.15} stroke="currentColor">
        <line x1="50" y1="100" x2="50" y2="135" strokeWidth="1.5" />
        <rect x="40" y="105" width="20" height="20" fill="currentColor" rx="3" />
        <circle cx="50" cy="115" r="4" fill="var(--surface)" />
      </g>
      <g className={isColor ? "text-text" : "text-text3"} opacity={isColor ? 1 : 0.2} stroke="currentColor">
        <line x1="85" y1="65" x2="85" y2="155" strokeWidth="1.5" />
        <rect x="75" y="85" width="20" height="35" fill="currentColor" rx="3" />
        <text x="85" y="102.5" className="candle-logo opacity-80" fill={isColor ? "var(--surface)" : "transparent"}>T</text>
      </g>
      <g className={isColor ? "text-text" : "text-text3"} opacity={isColor ? 1 : 0.25} stroke="currentColor">
        <line x1="120" y1="85" x2="120" y2="165" strokeWidth="1.5" />
        <rect x="110" y="95" width="20" height="45" fill="currentColor" rx="3" />
        <text x="120" y="117.5" className="candle-logo tracking-tighter" fill={isColor ? "var(--surface)" : "transparent"}>N</text>
      </g>
      <g className={isColor ? "text-orange" : "text-text3"} opacity={isColor ? 1 : 0.2} stroke="currentColor">
        <line x1="155" y1="105" x2="155" y2="175" strokeWidth="2" />
        <rect x="143" y="115" width="24" height="36" fill="currentColor" rx="3" />
        <text x="155" y="133" className="candle-logo text-[12px]" fill={isColor ? "white" : "transparent"}>₿</text>
      </g>
      <g className={isColor ? "text-yellow" : "text-text3"} opacity={isColor ? 1 : 0.2} stroke="currentColor">
        <polygon points="195,50 188,58 202,58" fill={isColor ? "var(--red)" : "transparent"} stroke="none" />
        <line x1="195" y1="70" x2="195" y2="140" strokeWidth="2" />
        <rect x="183" y="85" width="24" height="30" fill="currentColor" rx="3" />
        <text x="195" y="100" className="candle-logo text-[12px]" fill={isColor ? "white" : "transparent"}>★</text>
      </g>
      <g className={isColor ? "text-blue" : "text-text3"} opacity={isColor ? 1 : 0.25} stroke="currentColor">
        <line x1="235" y1="45" x2="235" y2="115" strokeWidth="2" />
        <rect x="223" y="55" width="24" height="42" fill="currentColor" rx="3" />
        <text x="235" y="76" className="candle-logo text-[12px]" fill={isColor ? "white" : "transparent"}>💧</text>
      </g>
      <g className={isColor ? "text-text" : "text-text3"} opacity={isColor ? 1 : 0.3} stroke="currentColor">
        <line x1="275" y1="35" x2="275" y2="105" strokeWidth="1.5" />
        <rect x="265" y="50" width="20" height="30" fill="currentColor" rx="3" />
        <text x="275" y="66" className="candle-logo opacity-90" fill={isColor ? "var(--surface)" : "transparent"}>A</text>
      </g>
      <g className={isColor ? "text-text" : "text-text3"} opacity={isColor ? 1 : 0.2} stroke="currentColor">
        <line x1="310" y1="105" x2="310" y2="140" strokeWidth="1.5" />
        <rect x="300" y="110" width="20" height="18" fill="currentColor" rx="3" />
        <circle cx="310" cy="119" r="3.5" fill={isColor ? "var(--surface)" : "transparent"} strokeWidth="1.5" />
      </g>
      <path d="M250 180 L253 175 L256 180 L253 185 Z" fill={isColor ? "var(--orange)" : "transparent"} />
      <circle cx="280" cy="150" r="1.5" fill={isColor ? "var(--blue)" : "transparent"} />
    </>
  );

  return (
    <div className="fade-in flex flex-col gap-3.5 p-7 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
          <span className="text-sm font-bold text-text">Live Positions</span>
          <span className="text-xs text-text3">Auto-update setiap 10 detik</span>
        </div>
        <div className="flex gap-2 text-[11px] font-semibold tracking-wide uppercase">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full shadow-sm border ${totalLivePnl >= 0 ? 'bg-green-bg border-green-br text-green' : 'bg-red-bg border-red-br text-red'}`}>
            <span>Unrealized PnL:</span>
            <b className="text-[12px] font-extrabold font-mono tracking-tight">
              {totalLivePnl >= 0 ? "+" : ""}{fmtUSD(totalLivePnl)}
            </b>
          </div>
          {account && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-surface shadow-sm text-text2">
              <span>Equity:</span>
              <b className="text-[12px] font-extrabold font-mono tracking-tight text-text">${account.equity?.toFixed(2)}</b>
            </div>
          )}
          {account && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-surface shadow-sm text-text2">
              <span>Margin:</span>
              <b className="text-[12px] font-extrabold font-mono tracking-tight text-text">${account.margin?.toFixed(2)}</b>
            </div>
          )}
        </div>
      </div>

      {liveTrades.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 py-10 fade-in bg-surface border border-border rounded-2xl shadow-sm overflow-hidden mb-6">
          <style>{`
            @keyframes glassPan {
              0%, 100% { transform: translate(0px, 0px) translateZ(0); }
              33% { transform: translate(-35px, -15px) translateZ(0); }
              66% { transform: translate(35px, 15px) translateZ(0); }
            }
            @keyframes glassPanReverse {
              0%, 100% { transform: translate(0px, 0px) translateZ(0); }
              33% { transform: translate(35px, 15px) translateZ(0); }
              66% { transform: translate(-35px, -15px) translateZ(0); }
            }
            .glass-anim {
              animation: glassPan 7s ease-in-out infinite;
              will-change: transform;
            }
            .glass-anim-reverse {
              animation: glassPanReverse 7s ease-in-out infinite;
              will-change: transform;
            }
            .candle-logo { font-size: 8px; font-weight: 800; font-family: var(--fn); text-anchor: middle; dominant-baseline: central; }
          `}</style>

          <div className="relative w-[340px] h-[220px]">
            {/* Background Candlesticks (Monochrome Grayscale) */}
            <svg width="100%" height="100%" viewBox="0 0 340 220" className="absolute inset-0">
              {renderCandles(false)}
            </svg>

            {/* Hardware-accelerated Lens Mask Wrapper */}
            <div
              className="absolute overflow-hidden rounded-full glass-anim z-10 will-change-transform"
              style={{ top: '62px', left: '122px', width: '96px', height: '96px', WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
            >
              {/* GPU-composited Inverse Transform */}
              <div
                className="absolute glass-anim-reverse will-change-transform"
                style={{ top: '-62px', left: '-122px', width: '340px', height: '220px' }}
              >
                {/* Foreground Colored Candlesticks */}
                <svg width="100%" height="100%" viewBox="0 0 340 220" className="absolute inset-0 drop-shadow-md">
                  {renderCandles(true)}
                </svg>
              </div>

              {/* Lens Inner Glass Shine Reflection */}
              <div className="absolute inset-0 shadow-[inset_2px_6px_14px_rgba(255,255,255,0.25)] rounded-full pointer-events-none mix-blend-overlay" />
              <div className="absolute inset-0 bg-text/5 rounded-full pointer-events-none border border-white/10" />
            </div>

            {/* Magnifying Glass Outer Frame & Handle */}
            <svg width="100%" height="100%" viewBox="0 0 340 220" className="absolute inset-0 z-20 pointer-events-none">
              <g className="glass-anim drop-shadow-xl">
                {/* Clean Frame Ring */}
                <circle cx="170" cy="110" r="48" fill="none" stroke="currentColor" strokeWidth="4.5" className="text-text2 dark:text-text3" />

                {/* Minimalist Handle */}
                <line x1="204" y1="144" x2="232" y2="172" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-text2 dark:text-text3" />

                {/* Elegant Minimal Shine Curves */}
                <path d="M 134 85 A 40 40 0 0 1 165 65" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
                <path d="M 188 142 A 40 40 0 0 1 155 152" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
              </g>
            </svg>
          </div>

          <div className="flex flex-col items-center gap-1.5 text-center px-4 relative z-20">
            <span className="text-[16.5px] font-extrabold text-text tracking-tight">Tidak ada posisi terbuka</span>
            <span className="text-[13.5px] font-medium text-text3 max-w-[300px] leading-relaxed">Menunggu peluang entry pantauan Anda. Pasar akan selalu memberikan kesempatan.</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                {["Ticket", "Symbol", "Type", "Lots", "Entry", "Current", "Pips", "Unrealized PnL", "SL", "TP", "Duration", "Open (WIB)"].map(h => (
                  <th key={h} className="py-2.5 px-3 text-[10px] text-text3 uppercase tracking-[.05em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liveTrades.map(t => (
                <tr key={t.id}>
                  <td className="text-[11px] text-text3">#{t.ticket}</td>
                  <td className="font-bold text-text">{t.symbol}</td>
                  <td>
                    <span className={`inline-block px-1.5 py-0.5 rounded-[3px] font-mono font-bold text-[10px] tracking-wide uppercase ${t.type.toUpperCase() === "BUY" ? "bg-blue-bg text-blue" : "bg-red-bg text-red"}`}>
                      {t.type}
                    </span>
                  </td>
                  <td>{t.lots}</td>
                  <td className="font-mono">{t.openPrice?.toFixed(5)}</td>
                  <td className="font-mono">{t.closePrice?.toFixed(5)}</td>
                  <td className={`font-semibold ${t.pips >= 0 ? 'text-green' : 'text-red'}`}>{t.pips >= 0 ? "+" : ""}{t.pips?.toFixed(1)}</td>
                  <td className={`font-extrabold text-sm ${t.pnl >= 0 ? 'text-green' : 'text-red'}`}>{fmtUSD(t.pnl)}</td>
                  <td className="text-red text-[11px]">{t.sl || "--"}</td>
                  <td className="text-green text-[11px]">{t.tp || "--"}</td>
                  <td className="text-[11px] text-text3">
                    {t.durationMs ? (() => {
                      const m = Math.floor(t.durationMs / 60000);
                      return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
                    })() : "-"}
                  </td>
                  <td className="text-[11px] text-text3 whitespace-nowrap">{t.openTimeWIB?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Account Summary */}
      {account && (
        <div className="grid grid-cols-5 gap-3">
          {[
            ["Balance", "$" + account.balance?.toFixed(2), "text-text"],
            ["Equity", "$" + account.equity?.toFixed(2), account.equity >= account.balance ? "text-green" : "text-red"],
            ["Margin", "$" + account.margin?.toFixed(2), "text-text"],
            ["Free Margin", "$" + account.freeMargin?.toFixed(2), account.freeMargin > 0 ? "text-green" : "text-red"],
            ["Leverage", "1:" + account.leverage, "text-accent2"],
          ].map(([lbl, val, col]) => (
            <div key={lbl as string} className="card py-3 px-3.5">
              <div className="text-[10px] text-text3 uppercase tracking-[.05em] mb-0.5">{lbl}</div>
              <div className={`text-[13.5px] font-mono font-bold ${col as string}`}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
