"use client";

import { useState, useEffect } from "react";
import { useAlertStore, AnyAlert, CandleAlert, PriceAlert } from "@/store";
import { apiPost } from "@/lib/api";

const SOUND_PRESETS = [
  { label: "Notification Bell", url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" },
  { label: "Soft Chime", url: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3" },
  { label: "Digital Beep", url: "https://assets.mixkit.co/active_storage/sfx/2954/2954-preview.mp3" },
  { label: "Upload Audio File...", url: "custom" }
];

export default function AlertsPage() {
  const { alerts, addAlert, updateAlert, deleteAlert, addToast } = useAlertStore();

  const [activeTab, setActiveTab] = useState<"candle" | "price">("price");

  // Candle State
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("M5");
  const [minBody, setMinBody] = useState<number>(50);
  const [maxWick, setMaxWick] = useState<number>(25);

  const [priceSymbol, setPriceSymbol] = useState("XAUUSD");
  const [trigger, setTrigger] = useState<"Above" | "Below" | "Crosses">("Above");
  const [targetPrice, setTargetPrice] = useState<string>("");
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [frequency, setFrequency] = useState<"Once" | "Everytime">("Once");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (activeTab !== "price") return;
    if (!priceSymbol) return;
    if (!isInputFocused) return;

    let mounted = true;

    const fetchPrice = async () => {
      try {
        const payload = { items: [{ symbol: priceSymbol.toUpperCase(), timeframe: "M1" }] };
        // We use the same backend endpoint AlertWatcher uses to get the latest M1 tick
        const json = await apiPost<any>("/api/candles", payload);
        if (json.data && json.data.length > 0) {
          const candles = json.data[0].candles;
          if (candles && candles.length > 1) {
            if (mounted) setSuggestedPrice(candles[1].close);
          }
        }
      } catch (err) { }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000); // refresh closely matches the 5s tick rate

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [priceSymbol, activeTab, isInputFocused]);

  const [soundPreset, setSoundPreset] = useState(SOUND_PRESETS[0].url);
  const [customSoundUrl, setCustomSoundUrl] = useState("");
  const [fileName, setFileName] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setCustomSoundUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const playTestSound = (url: string) => {
    if (!url || url === "custom") return;
    try {
      new Audio(url).play().catch(e => console.error(e));
    } catch (e) { }
  };

  const testAlert = (alert: AnyAlert) => {
    playTestSound(alert.soundUri);
    if (alert.type === "candle") {
      addToast({
        title: `🚨 ${alert.symbol} ${alert.timeframe} Test!`,
        message: `Bullish candle with ${alert.minBodyPips} pips body and ${alert.maxWickPercent}% wick is currently forming!`,
        type: "bullish"
      });
    } else {
      addToast({
        title: `🎯 ${alert.symbol} Price Alert!`,
        message: `${alert.symbol} has crossed ${alert.trigger} ${alert.targetPrice}!`,
        type: alert.trigger === "Above" ? "bullish" : "bearish"
      });
    }
  };

  const handleAddCandleAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const activeSound = soundPreset === "custom" ? customSoundUrl : soundPreset;
    addAlert({
      type: "candle",
      symbol: symbol.toUpperCase(),
      timeframe,
      minBodyPips: minBody,
      maxWickPercent: maxWick,
      soundUri: activeSound,
      enabled: true
    } as Omit<CandleAlert, 'id'>);
  };

  const handleAddPriceAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const activeSound = soundPreset === "custom" ? customSoundUrl : soundPreset;
    const priceNum = parseFloat(targetPrice);
    if (isNaN(priceNum)) return alert("Invalid price format");

    addAlert({
      type: "price",
      symbol: priceSymbol.toUpperCase(),
      trigger,
      targetPrice: priceNum,
      frequency,
      notes,
      soundUri: activeSound,
      enabled: true
    } as Omit<PriceAlert, 'id'>);

    setTargetPrice("");
    setNotes("");
  };

  return (
    <div className="p-7 fade-in h-[calc(100vh-60px)] overflow-y-auto pt-[30px] pr-[30px] pb-[30px] pl-[30px] max-w-8xl mx-auto">
      <div className="mb-8 shrink-0">
        <h1 className="text-2xl font-extrabold text-text tracking-[-0.8px] leading-tight mb-1">
          Market Alerts
        </h1>
        <p className="text-[12px] font-semibold text-text3 tracking-[.04em]">
          Custom live MT5 push notifications based on real-time price action conditions
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-8">
        {/* Configuration Panel */}
        <div className="card shadow-sm border border-[#00000008] bg-surface h-fit sticky top-0">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("price")}
              className={`flex-1 py-3.5 text-[12px] font-bold tracking-wide transition-colors ${activeTab === "price" ? 'text-text border-b-2 border-accent' : 'text-text3 hover:text-text2'}`}
            >
              Price Alert
            </button>
            <button
              onClick={() => setActiveTab("candle")}
              className={`flex-1 py-3.5 text-[12px] font-bold tracking-wide transition-colors ${activeTab === "candle" ? 'text-text border-b-2 border-accent' : 'text-text3 hover:text-text2'}`}
            >
              Candle Momentum
            </button>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Alert Sound</label>
              <div className="flex gap-2">
                <select
                  value={soundPreset}
                  onChange={e => setSoundPreset(e.target.value)}
                  className="flex-1 bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text focus:border-accent outline-none transition-colors"
                >
                  {SOUND_PRESETS.map(s => (
                    <option key={s.label} value={s.url}>{s.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => playTestSound(soundPreset === "custom" ? customSoundUrl : soundPreset)}
                  className="px-3 py-2 bg-text text-surface rounded-lg text-[11px] font-bold hover:bg-black transition-colors"
                >
                  ▶ Play
                </button>
              </div>

              {soundPreset === "custom" && (
                <div className="mt-3">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text outline-none file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-[10px] file:font-extrabold file:bg-surface3 file:text-text hover:file:bg-surface2 cursor-pointer transition-all"
                    required={!customSoundUrl}
                  />
                  {fileName && (
                    <div className="text-[10px] font-bold text-accent mt-1.5 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      File terunggah: {fileName}
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeTab === "price" ? (
              <form onSubmit={handleAddPriceAlert} className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Pair</label>
                    <input
                      type="text"
                      value={priceSymbol}
                      onChange={e => setPriceSymbol(e.target.value)}
                      placeholder="e.g. XAUUSD"
                      className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text focus:border-accent focus:ring-1 focus:ring-accent outline-none uppercase transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Trigger</label>
                    <select
                      value={trigger}
                      onChange={e => setTrigger(e.target.value as "Above" | "Below" | "Crosses")}
                      className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
                    >
                      <option value="Above">Above</option>
                      <option value="Below">Below</option>
                      <option value="Crosses">Crosses</option>
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Target Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={targetPrice}
                    onChange={e => setTargetPrice(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    placeholder="e.g. 2650.50"
                    className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[14px] font-bold text-text focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors pr-32"
                    required
                  />
                  {suggestedPrice !== null && (
                    <div className="absolute right-3 top-[30px] flex items-center">
                      <button
                        type="button"
                        onClick={() => setTargetPrice(suggestedPrice.toString())}
                        className="text-[11px] font-bold text-accent hover:underline bg-[#F9FAFB] pl-1"
                      >
                        {suggestedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} (Current price)
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Frequency</label>
                  <div className="flex bg-[#F9FAFB] p-1 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setFrequency("Once")}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-colors ${frequency === "Once" ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)] text-text' : 'text-text3 hover:text-text2'}`}
                    >
                      Once
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrequency("Everytime")}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-colors ${frequency === "Everytime" ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)] text-text' : 'text-text3 hover:text-text2'}`}
                    >
                      Everytime
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="E.g. Sell zone reached..."
                    rows={2}
                    className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-medium text-text focus:border-accent outline-none resize-none transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-4 bg-accent text-white py-2.5 rounded-lg text-[13px] font-bold hover:bg-accent-hover transition-colors shadow-sm"
                >
                  Create Price Alert
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddCandleAlert} className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Symbol</label>
                    <input
                      type="text"
                      value={symbol}
                      onChange={e => setSymbol(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text focus:border-accent outline-none uppercase transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Timeframe</label>
                    <select
                      value={timeframe}
                      onChange={e => setTimeframe(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text focus:border-accent outline-none transition-colors"
                    >
                      {["M1", "M5", "M15", "M30", "H1", "H4", "D1"].map(tf => (
                        <option key={tf} value={tf}>{tf}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Min Body (Pips)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={minBody}
                      onChange={e => setMinBody(parseFloat(e.target.value))}
                      className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text outline-none transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text3 mb-1.5 tracking-wider">Max Wick (%)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={maxWick}
                      onChange={e => setMaxWick(parseFloat(e.target.value))}
                      className="w-full bg-[#F9FAFB] border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-text outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-4 bg-text text-white py-2.5 rounded-lg text-[13px] font-bold hover:bg-black transition-colors shadow-sm"
                >
                  Create Momentum Alert
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Active Alerts List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold text-text">Active Monitoring Rules</h3>
            <span className="text-[11px] font-bold bg-surface3 text-text2 px-2 py-0.5 rounded-full">{alerts.length} Total</span>
          </div>

          {alerts.length === 0 ? (
            <div className="card shadow-sm border border-[#00000008] bg-surface flex flex-col items-center justify-center p-12 text-center">
              <span className="text-3xl mb-3 opacity-80">📡</span>
              <div className="text-[13px] font-bold text-text2">No alerts configured</div>
              <div className="text-[11px] font-semibold text-text3 mt-1">Add a rule from the left panel to start tracking.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.map(alert => (
                <div key={alert.id} className={`card p-4 transition-all shadow-sm ${alert.enabled ? 'border-l-[3px] border-l-accent border-y-[#00000008] border-r-[#00000008] bg-surface hover:shadow-md' : 'border border-[#00000008] bg-[#F9FAFB] opacity-70 grayscale-[50%]'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      {alert.type === "price" ? (
                        <span className="flex items-center justify-center w-5 h-5 rounded bg-accent/10 text-accent text-[12px]">🎯</span>
                      ) : (
                        <span className="flex items-center justify-center w-5 h-5 rounded bg-yellow/10 text-yellow text-[12px]">⚡</span>
                      )}
                      <span className="text-[14px] font-extrabold text-text tracking-tight">{alert.symbol}</span>
                      {alert.type === "candle" && (
                        <span className="px-1.5 py-0.5 bg-surface3 rounded text-[9px] font-extrabold text-text2 uppercase">{alert.timeframe}</span>
                      )}
                    </div>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={alert.enabled}
                        onChange={() => updateAlert(alert.id, { enabled: !alert.enabled })}
                      />
                      <div className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors ${alert.enabled ? 'bg-accent' : 'bg-surface3 border border-border'}`}>
                        <div className={`w-3 h-3 rounded-full bg-surface shadow-sm transition-transform ${alert.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </label>
                  </div>

                  {alert.type === "price" ? (
                    <div className="space-y-2 mb-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${alert.trigger === "Above" ? "text-green" : "text-red"}`}>
                          {alert.trigger}
                        </span>
                        <span className="text-[16px] font-extrabold text-text tracking-tight">{alert.targetPrice}</span>
                      </div>
                      <div className="flex gap-2 text-[10px] font-bold text-text3">
                        <span className="bg-surface3 px-1.5 py-0.5 rounded">{alert.frequency}</span>
                        {alert.notes && <span className="bg-surface3 px-1.5 py-0.5 rounded truncate max-w-[120px]">{alert.notes}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-bold text-text3 space-y-1 mb-4 bg-surface3/50 p-2 rounded border border-border/50">
                      <div className="flex justify-between"><span className="text-text2">Candle Body</span> <span>≥ {alert.minBodyPips} pips</span></div>
                      <div className="flex justify-between"><span className="text-text2">Total Wick</span> <span>≤ {alert.maxWickPercent}%</span></div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => testAlert(alert)}
                      className="flex-1 py-1.5 bg-surface border border-border rounded text-[10px] font-bold text-text2 hover:text-text hover:bg-surface3 transition-colors shadow-sm"
                    >
                      ▶ Test
                    </button>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="px-3 py-1.5 bg-surface text-red border border-border rounded text-[10px] font-bold hover:bg-red/10 hover:border-red/20 transition-colors shadow-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
