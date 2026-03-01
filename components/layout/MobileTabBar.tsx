"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMT5Store } from "@/store";

const TABS = [
    {
        id: "overview",
        href: "/dashboard",
        label: "Home",
        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    },
    {
        id: "trades",
        href: "/dashboard/trades",
        label: "Trades",
        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
    },
    {
        id: "journal",
        href: "/dashboard/journal",
        label: "Journal",
        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
    },
    {
        id: "news",
        href: "/dashboard/news",
        label: "News",
        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" /></svg>
    },
    {
        id: "menu",
        href: "/dashboard/more",
        label: "Menu",
        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
    }
];

export default function MobileTabBar() {
    const pathname = usePathname();
    const { trades } = useMT5Store();

    const liveCount = trades.filter((t) => t.status === "live").length;

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg/90 backdrop-blur-md border-t border-border z-50 flex items-center justify-around px-2 pb-safe">
            {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.id !== "overview" && pathname.startsWith(tab.href + "/"));

                return (
                    <Link
                        key={tab.id}
                        href={tab.href}
                        className={`relative flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? "text-accent" : "text-text3 hover:text-text2"
                            } transition-colors`}
                    >
                        <div className="relative">
                            {tab.icon}
                            {/* Badge for Menu (if live trades) or specific tabs */}
                            {tab.id === "menu" && liveCount > 0 && (
                                <div className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-bg">
                                    {liveCount}
                                </div>
                            )}
                        </div>
                        <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                    </Link>
                );
            })}
        </div>
    );
}
