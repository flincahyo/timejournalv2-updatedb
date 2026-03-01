"use client";
import { useState } from 'react';
import { useRouter } from "next/navigation";
import { useAuthStore, useThemeStore, useMT5Store } from "@/store";
import { clearSession } from "@/lib/auth";
import MT5ConnectModal from "@/components/modals/MT5ConnectModal";

const IC = {
    live: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2.5" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.07 4.93a10 10 0 0 1 0 14.14M3.93 19.07a10 10 0 0 1 0-14.14" /></svg>,
    watchlist: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    time: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    analytics: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
    calendar: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    alerts: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
    sun: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
    moon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
    logout: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
    chevron: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text3"><polyline points="9 18 15 12 9 6" /></svg>
};

const MENU_ITEMS = [
    { id: "live", href: "/dashboard/live", icon: "live", label: "Live Trades", desc: "Monitor running positions" },
    { id: "analytics", href: "/dashboard/analytics", icon: "analytics", label: "Analytics", desc: "Advanced performance metrics" },
    { id: "calendar", href: "/dashboard/calendar", icon: "calendar", label: "Calendar", desc: "Daily PnL tracking and history" },
    { id: "alerts", href: "/dashboard/alerts", icon: "alerts", label: "Alerts", desc: "Price & Momentum trackers" },
    { id: "watchlist", href: "/dashboard/watchlist", icon: "watchlist", label: "Watchlist", desc: "Track symbol movements" },
    { id: "timemetrics", href: "/dashboard/timemetrics", icon: "time", label: "Time Metrics", desc: "Session & duration analysis" },
];

export default function MoreMenuPage() {
    const router = useRouter();
    const { user, setUser } = useAuthStore();
    const { theme, toggleTheme } = useThemeStore();
    const { isConnected, account, liveTrades } = useMT5Store();
    const [showMT5, setShowMT5] = useState(false);

    const handleLogout = () => {
        clearSession();
        setUser(null);
        router.replace("/login");
    };

    return (
        <div className="fade-in flex flex-col p-4 pb-24 max-w-2xl mx-auto w-full">
            {/* Header Profile Area */}
            <div className="flex items-center gap-4 mb-8 mt-2 p-1">
                <div className="w-[54px] h-[54px] rounded-full bg-gradient-to-tr from-[#F59E0B] to-[#EA580C] shadow-md flex items-center justify-center text-[20px] font-extrabold text-white">
                    {user?.name?.slice(0, 2).toUpperCase() || 'TR'}
                </div>
                <div className="flex flex-col">
                    <span className="text-[20px] font-extrabold text-text tracking-tight leading-tight">{user?.name || "Trader"}</span>
                    <span className="text-[14px] font-medium text-text3">{user?.email || "Guest Session"}</span>
                </div>
            </div>

            {/* MT5 Connection */}
            <div className="flex flex-col gap-3 mb-8">
                <h3 className="text-[12px] uppercase font-bold text-text3 mb-1 tracking-wider px-2">Broker Connection</h3>
                <div className="bg-surface border border-border rounded-[20px] overflow-hidden shadow-sm">
                    <div
                        onClick={() => setShowMT5(true)}
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface2 transition-colors active:bg-surface3"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-[42px] h-[42px] rounded-full flex items-center justify-center ${isConnected ? 'bg-green-bg text-green border border-green-br' : 'bg-surface2 text-text3 border border-border'} relative`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                                {isConnected && (
                                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green border-2 border-surface"></span>
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[16px] font-bold text-text leading-tight">
                                    {isConnected ? (account ? `Connected: #${account.login}` : "MT5 Terminals API Connected") : "Connect MT5 Terminal"}
                                </span>
                                <span className="text-[12px] font-medium text-text3">
                                    {isConnected ? "Live sync active" : "Link your broker for automated journaling"}
                                </span>
                            </div>
                        </div>
                        {IC.chevron}
                    </div>
                </div>
            </div>

            {/* Navigation List */}
            <div className="flex flex-col gap-3 mb-8">
                <h3 className="text-[12px] uppercase font-bold text-text3 mb-1 tracking-wider px-2">Main Features</h3>

                <div className="bg-surface border border-border rounded-[20px] overflow-hidden shadow-sm">
                    {MENU_ITEMS.map((item, idx) => (
                        <div
                            key={item.id}
                            onClick={() => router.push(item.href)}
                            className={`flex items-center justify-between p-4 cursor-pointer hover:bg-surface2 transition-colors active:bg-surface3 ${idx !== MENU_ITEMS.length - 1 ? 'border-b border-border' : ''}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-[42px] h-[42px] rounded-full bg-surface2 flex items-center justify-center text-text2 relative">
                                    {IC[item.icon as keyof typeof IC]}
                                    {item.id === "live" && liveTrades.length > 0 && (
                                        <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-green border-[2px] border-surface" />
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[16px] font-bold text-text leading-tight">{item.label}</span>
                                    <span className="text-[12px] font-medium text-text3">{item.desc}</span>
                                </div>
                            </div>
                            {IC.chevron}
                        </div>
                    ))}
                </div>
            </div>

            {/* Preferences & App Settings */}
            <div className="flex flex-col gap-3">
                <h3 className="text-[12px] uppercase font-bold text-text3 mb-1 tracking-wider px-2">Preferences</h3>

                <div className="bg-surface border border-border rounded-[20px] overflow-hidden shadow-sm">
                    {/* Dark Mode Toggle */}
                    <div
                        onClick={toggleTheme}
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface2 transition-colors active:bg-surface3 border-b border-border"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-[42px] h-[42px] rounded-full bg-surface2 flex items-center justify-center text-text2">
                                {theme === 'dark' ? IC.sun : IC.moon}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[16px] font-bold text-text leading-tight">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                                <span className="text-[12px] font-medium text-text3">Switch visual theme</span>
                            </div>
                        </div>
                        {/* Toggle Switch UI */}
                        <div className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors ${theme === 'dark' ? 'bg-accent' : 'bg-surface3 border border-border'}`}>
                            <div className={`w-5 h-5 rounded-full bg-surface shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    {/* Logout Button */}
                    <div
                        onClick={handleLogout}
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-red/5 transition-colors active:bg-red/10"
                    >
                        <div className="w-[42px] h-[42px] rounded-full bg-red/10 flex items-center justify-center text-red">
                            {IC.logout}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-red leading-tight">Sign Out</span>
                            <span className="text-[12px] font-medium text-text3">Clear session data</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center text-[11px] font-semibold text-text3 mt-auto">
                UltraJournal Mobile App v1.0.0<br />Powered by Next.js & WebView
            </div>

            {/* Mount Modal */}
            {showMT5 && <MT5ConnectModal onClose={() => setShowMT5(false)} />}
        </div>
    );
}
