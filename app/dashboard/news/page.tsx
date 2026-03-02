"use client";
import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNewsStore } from '@/store';
import { toWIB } from '@/lib/utils';
import ReactMarkdown from "react-markdown";
import { apiPost } from '@/lib/api';

interface FFEvent {
    title: string;
    country: string;
    date: string;
    impact: string;
    forecast: string;
    previous: string;
}

export default function NativeNewsPage() {
    const container = useRef<HTMLDivElement>(null);
    const [events, setEvents] = useState<FFEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const { settings, updateSettings } = useNewsStore();
    const [activeDayIdx, setActiveDayIdx] = useState<number>(0);

    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiInsights, setAiInsights] = useState("");

    // For hydration-safe portals
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const generateAIInsights = async () => {
        // Filter activeEvents (current day in view) based on active settings
        const filteredEvents = activeEvents.filter(e => {
            const matchCurrency = settings.currencies.includes(e.country);
            const matchImpact = settings.impacts.includes(e.impact);
            return matchCurrency && matchImpact;
        });

        // Filter the ENTIRE week's events based on active settings to serve as macro context
        const contextEvents = events.filter(e => {
            const matchCurrency = settings.currencies.includes(e.country);
            const matchImpact = settings.impacts.includes(e.impact);
            return matchCurrency && matchImpact;
        });

        if (filteredEvents.length === 0) {
            alert(`Tidak ada berita di hari ${activeDayKey} yang cocok dengan filter Notifikasi Anda.`);
            return;
        }

        setIsGeneratingAI(true);
        setAiInsights("");

        try {
            const data = await apiPost<any>("/api/ai/analyze-news", {
                target_events: filteredEvents,
                context_events: contextEvents
            });
            if (data.success) {
                setAiInsights(data.insight);
            } else {
                setAiInsights("âŒ AI Agent gagal memberikan analisis.");
            }
        } catch (err) {
            console.error("AI Error:", err);
            setAiInsights("âŒ Terjadi kesalahan saat menghubungi API AI Analyst.");
        } finally {
            setIsGeneratingAI(false);
        }
    };

    // MQL5 Widget Injection
    useEffect(() => {
        if (container.current && container.current.querySelector('script')) return;

        const script = document.createElement('script');
        script.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=15';
        script.type = 'text/javascript';
        script.async = true;
        script.setAttribute('data-type', 'calendar-widget');
        script.innerHTML = `{"width":"100%","height":"100%","mode":"2","display_mode":0,"lang":"en","timezone":"SE Asia Standard Time"}`;

        container.current?.appendChild(script);

        return () => {
            if (script && script.parentNode) script.parentNode.removeChild(script);
            if (container.current) container.current.innerHTML = '<div id="economicCalendarWidget" class="w-full h-full border-none"></div>';
            if (typeof window !== 'undefined' && (window as any).calendarCompletedID) {
                const arr = (window as any).calendarCompletedID as string[];
                const idx = arr.indexOf('economicCalendarWidget');
                if (idx !== -1) arr.splice(idx, 1);
            }
        };
    }, []);

    useEffect(() => {
        fetch("/api/news")
            .then(res => res.json())
            .then((data: FFEvent[]) => {
                if (Array.isArray(data)) {
                    const sorted = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    setEvents(sorted);

                    // Try to set active day to today
                    const todayKey = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    const uniqueDays = Array.from(new Set(sorted.map(e => new Date(e.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))));
                    const tIdx = uniqueDays.indexOf(todayKey);
                    if (tIdx !== -1) setActiveDayIdx(tIdx);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const requestNotificationPermission = async () => {
        // 1. Check if running in mobile app via WebView bridge
        const isMobileApp = typeof window !== 'undefined' && 'ReactNativeWebView' in window;

        if (isMobileApp) {
            // Mobile app handles permissions natively, just toggle the database setting
            updateSettings({ enabled: !settings.enabled });
            return;
        }

        // 2. Desktop Browser HTML5 Fallback
        if (!('Notification' in window)) {
            alert("Browser ini tidak mendukung notifikasi desktop.");
            return;
        }
        if (Notification.permission === 'default') {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                updateSettings({ enabled: true });
            }
        } else if (Notification.permission === 'denied') {
            alert("Izin notifikasi telah diblokir. Harap izinkan melalui pengaturan browser.");
        } else {
            updateSettings({ enabled: !settings.enabled });
        }
    };

    const getImpactColor = (impact: string) => {
        switch (impact) {
            case "High": return "bg-[#ff3b30] text-white";
            case "Medium": return "bg-[#ff9500] text-white";
            case "Low": return "bg-surface3 text-text2 border border-border";
            default: return "bg-surface3 text-text3";
        }
    };

    const dayGroups = useMemo(() => {
        const groups: Record<string, FFEvent[]> = {};
        events.forEach(e => {
            const d = new Date(e.date);
            // Group by local Date string
            const dateKey = d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(e);
        });
        return groups;
    }, [events]);

    const dayKeys = Object.keys(dayGroups);
    const activeDayKey = dayKeys[activeDayIdx] || "";
    const activeEvents = dayGroups[activeDayKey] || [];
    const isToday = activeDayKey === new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"];
    const IMPACTS = ["High", "Medium", "Low"];

    const toggleArray = (arr: string[], val: string) =>
        arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

    return (
        <>
            <div className="fade-in p-4 md:p-7 md:pt-[30px] md:pr-[30px] md:pb-[30px] md:pl-[30px] h-auto lg:h-[calc(100vh-60px)] flex flex-col max-w-none gap-4 lg:gap-0 pb-20">
                <div className="flex flex-col md:flex-row md:items-start justify-between mb-2 lg:mb-6 shrink-0 gap-3">
                    <div>
                        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 mb-1">
                            <h1 className="text-2xl font-extrabold text-text tracking-[-0.8px] leading-tight flex items-center gap-3">
                                Economic Calendar
                                <button
                                    onClick={() => setIsAiModalOpen(true)}
                                    className="ai-btn flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-bold shadow-md cursor-pointer shrink-0"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="relative z-10"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 12 2.1 12" /><path d="M12 12 21.9 12" /><path d="M12 12 12 21.9" /><path d="M12 12 12 2.1" /></svg>
                                    <span className="relative z-10">AI Analyst</span>
                                    <div className="ai-sparkle w-1 h-1 top-1.5 right-2 animation-delay-300"></div>
                                    <div className="ai-sparkle w-1 bottom-1 left-2.5 animation-delay-700"></div>
                                </button>
                            </h1>
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-sm ${settings.enabled ? 'bg-text text-surface shadow-md border-transparent hover:opacity-90' : 'bg-surface text-text border border-border hover:bg-surface2'} ${showSettings ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
                                title="Notification Settings"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                            </button>
                        </div>
                        <p className="text-[12px] font-semibold text-text3 tracking-[.04em]">
                            Native data feed synced with global macroeconomic events
                        </p>
                    </div>
                </div>

                {showSettings && (
                    <div className="card shrink-0 mb-6 border-accent/20 bg-accent-s/50 p-5 fade-in shadow-sm">
                        <div className="flex items-center justify-between mb-5 border-b border-border/50 pb-4">
                            <div>
                                <h3 className="text-[13px] font-bold text-text">Push Notification Engine</h3>
                                <p className="text-[11px] text-text3 mt-0.5">TimeJournal akan mengirim notifikasi browser tepat sebelum berita ForexFactory rilis.</p>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-[11px] font-bold text-text2">Master Toggle</span>
                                <input type="checkbox" className="hidden" checked={settings.enabled} onChange={requestNotificationPermission} />
                                <div className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors ${settings.enabled ? 'bg-accent' : 'bg-surface3 border border-border'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${settings.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                </div>
                            </label>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-8 opacity-100 transition-opacity" style={{ opacity: settings.enabled ? 1 : 0.5, pointerEvents: settings.enabled ? 'auto' : 'none' }}>
                            <div className="flex-1">
                                <div className="text-[9px] uppercase font-bold text-text3 mb-3 tracking-wider">Mata Uang (Currencies)</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {CURRENCIES.map(c => (
                                        <button key={c} onClick={() => updateSettings({ currencies: toggleArray(settings.currencies, c) })} className={`px-2.5 py-[5px] rounded-[6px] text-[10px] font-bold transition-colors ${settings.currencies.includes(c) ? 'bg-text text-surface' : 'bg-surface border border-border text-text2 hover:border-text3'}`}>
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] uppercase font-bold text-text3 mb-3 tracking-wider">Tingkat Dampak (Impacts)</div>
                                <div className="flex gap-1.5">
                                    {IMPACTS.map(i => (
                                        <button key={i} onClick={() => updateSettings({ impacts: toggleArray(settings.impacts, i) })} className={`px-3 py-[5px] rounded-[6px] text-[10px] font-bold transition-colors ${settings.impacts.includes(i) ? getImpactColor(i) : 'bg-surface border border-border text-text2 hover:border-text3'}`}>
                                            {i}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] uppercase font-bold text-text3 mb-3 tracking-wider">Waktu (Menit Sebelum)</div>
                                <div className="flex gap-1.5">
                                    {[5, 15, 30, 60].map(m => (
                                        <button key={m} onClick={() => updateSettings({ minutesBefore: m })} className={`px-3 py-[5px] rounded-[6px] text-[10px] font-bold transition-colors ${settings.minutesBefore === m ? 'bg-text text-surface' : 'bg-surface border border-border text-text2 hover:border-text3'}`}>
                                            {m}m
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
                }

                {/* Main Split Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 flex-1 min-h-0 pb-10">

                    {/* Left Col: Native ForexFactory Paginated */}
                    <div className="flex flex-col h-[500px] lg:h-full overflow-hidden">
                        {loading ? (
                            <div className="flex-1 flex items-center justify-center text-text3 text-[11px] font-semibold animate-pulse card border-border bg-surface shadow-none">Syncing macro events...</div>
                        ) : dayKeys.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-text3 text-[11px] font-semibold card border-border bg-surface shadow-none">No events this week.</div>
                        ) : (
                            <div className="flex-1 flex flex-col min-h-0 bg-surface border border-border rounded-xl shadow-sm overflow-hidden">

                                {/* Pagination Header */}
                                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface2 shrink-0">
                                    <button
                                        onClick={() => setActiveDayIdx(Math.max(0, activeDayIdx - 1))}
                                        disabled={activeDayIdx === 0}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-border text-text2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                                    </button>

                                    <div className="font-bold text-[13px] text-text flex items-center gap-2">
                                        {activeDayKey}
                                        {isToday && <span className="bg-accent-s text-accent px-2 py-0.5 rounded text-[9px] uppercase tracking-widest">Today</span>}
                                    </div>

                                    <button
                                        onClick={() => setActiveDayIdx(Math.min(dayKeys.length - 1, activeDayIdx + 1))}
                                        disabled={activeDayIdx === dayKeys.length - 1}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-border text-text2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                                    </button>
                                </div>

                                {/* Event List for Active Day */}
                                <div className="flex-1 overflow-y-auto">
                                    {activeEvents.length === 0 ? (
                                        <div className="p-5 text-center text-text3 text-[11px]">No events on this day.</div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <tbody>
                                                {activeEvents.map((e, i) => {
                                                    const d = new Date(e.date);
                                                    const isPast = d.getTime() < Date.now();
                                                    return (
                                                        <tr key={i} className={`border-b border-border/40 dark:border-white/[0.03] last:border-0 hover:bg-surface3/30 transition-colors ${isPast ? 'opacity-50' : ''}`}>
                                                            <td className="py-2.5 px-5 w-24 text-[11px] font-mono text-text3 whitespace-nowrap">
                                                                {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="py-2.5 px-3 w-16">
                                                                <span className="font-bold text-[11px] text-text rounded px-1.5 py-0.5 bg-surface3 flex items-center justify-center">{e.country}</span>
                                                            </td>
                                                            <td className="py-2.5 px-3 w-16 text-[10px] font-bold">
                                                                <span className={`flex items-center justify-center px-1.5 py-[3px] rounded ${getImpactColor(e.impact)}`}>{e.impact}</span>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-[12px] font-semibold text-text leading-snug">{e.title}</td>
                                                            <td className="py-2.5 px-3 w-24 text-right pr-5">
                                                                <div className="text-[10.5px] font-mono text-text2 flex flex-col items-end gap-0.5">
                                                                    <span className="whitespace-nowrap"><span className="text-text3 opacity-60 mr-1 text-[9px] sans">F:</span>{e.forecast || '-'}</span>
                                                                    <span className="whitespace-nowrap"><span className="text-text3 opacity-60 mr-1 text-[9px] sans">P:</span>{e.previous || '-'}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                            </div>
                        )}
                    </div>

                    {/* Right Col: Tradays MQL5 Iframe */}
                    <div className="flex flex-col h-[600px] lg:h-full bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                        {/* Internal Header wrapper for visual parity */}
                        <div className="px-5 py-3 border-b border-border bg-surface2 shrink-0">
                            <div className="font-bold text-[13px] text-text flex items-center gap-2">
                                Tradates Feed
                                <span className="bg-surface3 text-text3 px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold">Widget</span>
                            </div>
                        </div>
                        <div className="flex-1 w-full relative au flex items-center justify-center bg-surface">
                            <div ref={container} className="w-full h-full absolute inset-0">
                                <div id="economicCalendarWidget" className="w-full h-full border-none"></div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* â”€â”€ AI News Analyst Modal â”€â”€ */}
                {
                    mounted && isAiModalOpen && createPortal(
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-surface/80 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
                            <div className="bg-surface2 border border-border w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-xl overflow-hidden relative">
                                <div className="p-5 border-b border-border flex justify-between items-center bg-surface shrink-0">
                                    <h2 className="text-[16px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 12 2.1 12" /><path d="M12 12 21.9 12" /><path d="M12 12 12 21.9" /><path d="M12 12 12 2.1" /></svg>
                                        Analisis Berita (XAUUSD)
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
                                            <h3 className="text-[15px] font-bold text-text mb-2">Sinyal Trading Fundamental (AI)</h3>
                                            <p className="text-[13px] text-text3 mb-4 max-w-sm">
                                                AI Analyst akan membedah rilis berita <b>hari ini</b> yang sesuai dengan <b>Filter Notifikasi</b>-mu, dan memberikan rekomendasi eksekusi aksi (<b>BUY / SELL</b>) untuk <b>XAUUSD</b> secara tegas.
                                            </p>
                                            <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mb-6 max-w-sm flex gap-2">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent shrink-0 mt-0.5"><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>
                                                <p className="text-[10px] text-text3 font-medium leading-relaxed text-left">
                                                    <span className="text-accent font-bold uppercase tracking-wider mr-1">Waspada Volatilitas:</span>
                                                    Algoritma AI hanya memecah probabilitas data makro historis. Pasar digerakkan oleh kepanikan emosi institusi. Gunakan sinyal ini sebagai proyektor arah, bukan instrumen buta. Keputusan pelatuk akhir ada pada jari Anda.
                                                </p>
                                            </div>
                                            <button
                                                onClick={generateAIInsights}
                                                disabled={activeEvents.length === 0}
                                                className="flex items-center gap-2 bg-text text-bg px-5 py-2.5 rounded-full text-[13px] font-bold shadow-md hover:scale-105 hover:bg-accent hover:text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="2" x2="12" y2="12" /><line x1="12" y1="12" x2="22" y2="12" /><path d="M12 22a10 10 0 1 1 10-10" /></svg>
                                                Minta Saran Eksekusi
                                            </button>
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
                                                <span className="text-[13px] font-bold text-text tracking-wide animate-pulse">Membedah Dampak Makroekonomi...</span>
                                                <span className="text-[11px] text-text3 font-medium">Berdiam diri, menyusun proyeksi XAUUSD.</span>
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
                                            Refresh Analisis
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>,
                        document.body
                    )
                }
            </div>
        </>
    );
}
