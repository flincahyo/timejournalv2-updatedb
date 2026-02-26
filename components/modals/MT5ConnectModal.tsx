"use client";
import { useState } from "react";
import { useMT5Store } from "@/store";
import { normalizeTrade } from "@/hooks/useMT5Sync";
import { Trade } from "@/types";

import { apiPost } from "@/lib/api";

export default function MT5ConnectModal({ onClose }: { onClose: () => void }) {
  const { setTrades, setLiveTrades, setAccount, setConnected, setConnectionParams, setLastSync, isConnected, account, lastSync } = useMT5Store();
  const [step, setStep] = useState<"form" | "connecting" | "done" | "error">(isConnected && account ? "done" : "form");
  const [form, setForm] = useState({ login: "", password: "", server: "", port: "443" });
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [importedCount, setImportedCount] = useState(0);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleConnect = async () => {
    if (!form.login || !form.password || !form.server) { setErrMsg("Isi semua field yang wajib."); return; }
    setErrMsg(""); setStep("connecting"); setProgress(0);

    const prog = setInterval(() => setProgress(p => Math.min(p + Math.random() * 12, 90)), 300);

    try {
      const data = await apiPost<any>("/api/mt5/connect", {
        login: parseInt(form.login),
        password: form.password,
        server: form.server,
        port: parseInt(form.port)
      });

      clearInterval(prog); setProgress(100);
      const normalizedTrades = ((data.trades || []) as Record<string, unknown>[]).map(normalizeTrade);
      const normalizedLive = ((data.live_trades || []) as Record<string, unknown>[]).map(normalizeTrade);

      setTrades(normalizedTrades);
      setLiveTrades(normalizedLive);
      if (data.account) setAccount(data.account);
      setConnected(true);
      setConnectionParams({ login: parseInt(form.login), server: form.server });
      setLastSync(new Date().toISOString());
      setImportedCount(normalizedTrades.length);

      setTimeout(() => setStep("done"), 400);
    } catch (err: unknown) {
      clearInterval(prog);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("fetch") || errorMsg.includes("network")) {
        // Backend tidak tersedia — pakai mock
        const { generateMockTrades } = await import("@/lib/mockData");
        const mock = generateMockTrades();
        setTrades(mock);
        setLiveTrades([]);
        setConnected(true);
        setConnectionParams({ login: parseInt(form.login || "0"), server: form.server || "Demo" });
        setLastSync(new Date().toISOString());
        setImportedCount(mock.length);
        setTimeout(() => setStep("done"), 400);
      } else {
        setErrMsg(errorMsg);
        setStep("error");
      }
    }
  };

  const handleDisconnect = () => {
    setConnected(false);
    setAccount(null);
    setTrades([]);
    setLiveTrades([]);
    setConnectionParams(null);
    onClose();
  };

  const inp = "bg-surface2 border border-border rounded-lg py-2.5 px-3.5 text-text text-[13px] w-full outline-none focus:border-accent focus:ring-2 focus:ring-accent-r transition-all duration-200";
  const lbl = "text-[11px] font-semibold text-text3 uppercase tracking-[.05em] block mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center backdrop-blur-md transition-all duration-300" onClick={onClose}>
      <div className="fade-in bg-surface rounded-2xl p-8 w-[460px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-surface2 flex items-center justify-center text-xl">🔌</div>
          <div>
            <div className="text-base font-bold text-text">Broker Connection</div>
            <div className="text-[11px] font-medium text-text3">MetaTrader 5 — Investor Read-only</div>
          </div>
          <button onClick={onClose} className="ml-auto text-text3 text-[22px] leading-none hover:text-text transition-colors">×</button>
        </div>

        {/* Connected state */}
        {step === "done" && isConnected && account && (
          <div className="fade-in">
            <div className="bg-surface2 border border-border rounded-[14px] p-5 mb-5">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                  <span className="text-[12px] font-bold text-text">Terhubung ke MT5</span>
                </div>
                <div className="text-[11.5px] font-mono font-medium text-text3">#{account.login}</div>
              </div>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                <div>
                  <div className="text-[9px] uppercase font-bold text-text3 mb-1 tracking-[.06em]">Balance</div>
                  <div className="text-[15px] font-mono font-bold text-text tracking-[-0.3px]">${account.balance?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-text3 mb-1 tracking-[.06em]">Equity</div>
                  <div className={`text-[15px] font-mono font-bold tracking-[-0.3px] ${account.equity >= account.balance ? 'text-green' : 'text-red'}`}>${account.equity?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-text3 mb-1 tracking-[.06em]">Margin</div>
                  <div className="text-[13px] font-mono font-medium text-text2">${account.margin?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-text3 mb-1 tracking-[.06em]">Free Margin</div>
                  <div className="text-[13px] font-mono font-medium text-text2">${account.freeMargin?.toFixed(2)}</div>
                </div>
              </div>
              {lastSync && <div className="mt-5 pt-3 border-t border-border/60 text-[10px] font-medium text-text3 tracking-wide">Last sync: {new Date(lastSync).toLocaleString("id-ID")}</div>}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 btn-outline py-2.5 text-[12.5px]">Tutup</button>
              <button onClick={handleDisconnect} className="flex-1 bg-surface border border-red/30 text-red hover:bg-red-bg py-2.5 rounded-full text-[12.5px] font-bold transition-colors">Disconnect MT5</button>
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="fade-in">
            <div className="bg-surface2 border border-border rounded-lg py-3 px-4 mb-6 text-[11.5px] text-text2 leading-relaxed">
              <span className="font-bold text-text">Data Read-only.</span> TimeJournal hanya menggunakan Investor Password untuk menarik riwayat trade, tidak bisa mengeksekusi posisi.
            </div>
            {errMsg && <div className="bg-red-bg border border-red-br rounded-lg py-2.5 px-3.5 mb-4 text-xs text-red font-medium">{errMsg}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={lbl}>Nomor Akun MT5 *</label>
                <input className={inp} value={form.login} onChange={e => set("login", e.target.value)} placeholder="e.g. 12345678" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Investor Password *</label>
                <input type="password" className={inp} value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <label className={lbl}>Broker Server *</label>
                <input className={inp} value={form.server} onChange={e => set("server", e.target.value)} placeholder="e.g. ICMarkets-Demo" />
              </div>
              <div>
                <label className={lbl}>Port</label>
                <input className={inp} value={form.port} onChange={e => set("port", e.target.value)} placeholder="443" />
              </div>
            </div>
            <button onClick={handleConnect} className="w-full mt-6 py-3 btn-dark text-[13px]">
              Connect &amp; Sync
            </button>
            <div className="text-center text-[10px] text-text3 mt-4 font-medium tracking-wide">Backend tidak jalan? Data demo akan dipakai otomatis.</div>
          </div>
        )}

        {step === "connecting" && (
          <div className="fade-in text-center py-5">
            <div className="w-14 h-14 rounded-full border-[3px] border-border border-t-accent animate-spin mx-auto mb-5" />
            <div className="text-sm font-semibold text-text mb-1.5">Menghubungkan ke MT5...</div>
            <div className="text-xs text-text3 mb-5 font-medium">Mengambil history trade</div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent to-accent2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[11px] font-bold text-text3 mt-2">{Math.round(progress)}%</div>
          </div>
        )}

        {step === "error" && (
          <div className="fade-in text-center py-5">
            <div className="mb-3.5 leading-none flex items-center justify-center"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#EF4444" fillOpacity="0.15" stroke="#EF4444" strokeWidth="1.5" /><path d="M15 9l-6 6M9 9l6 6" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" /></svg></div>
            <div className="text-[15px] font-bold text-text mb-2">Koneksi Gagal</div>
            <div className="text-[13px] font-medium text-text3 mb-5">{errMsg}</div>
            <button onClick={() => setStep("form")} className="py-2.5 px-6 btn-primary">Coba Lagi</button>
          </div>
        )}
      </div>
    </div>
  );
}
