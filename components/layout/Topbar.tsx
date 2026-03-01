"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMT5Store, useFilterStore, useFilteredTrades } from "@/store";
import MT5ConnectModal from "@/components/modals/MT5ConnectModal";
import FilterModal from "@/components/filters/FilterModal";
import DateRangeModal from "@/components/filters/DateRangeModal";
import AddTradeModal from "@/components/modals/AddTradeModal";

const PAGE_TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/timemetrics", label: "Time Metrics" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/calendar", label: "Calendar" },
];

const IcSearch = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const IcFilter = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
const IcCal = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const IcPlus = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isConnected, account } = useMT5Store();
  const { filter } = useFilterStore();
  const { all } = useFilteredTrades();
  const [showMT5, setShowMT5] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const filterCount = [
    filter.symbols.length, filter.side !== "all", filter.closeType !== "all",
    filter.setups.length, filter.sessions.length, filter.dateFrom, filter.dateTo,
    filter.minPnl !== null, filter.maxPnl !== null,
  ].filter(Boolean).length;

  return (
    <>
      <header className="h-[var(--topbar-h)] bg-[var(--bg-grad)] flex items-center px-4 md:px-6 gap-2 md:gap-3 shrink-0 sticky top-0 z-50 animate-[fadeDown_.45s_cubic-bezier(.16,1,.3,1)_both]">

        {/* â”€â”€ Pill tabs — Hidden on mobile since MobileTabBar handles page navigation â”€â”€ */}
        <div className="hidden md:inline-flex gap-[3px] bg-surface2 border border-border rounded-full p-1 ml-2">
          {PAGE_TABS.map(t => {
            const active = t.href === "/dashboard" ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <button key={t.href} className={`py-[5px] px-[18px] rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-300 ease-out whitespace-nowrap tracking-[-0.01em] ${active ? "bg-text text-bg shadow-s1" : "text-text3 hover:text-text hover:bg-surface3"}`} onClick={() => router.push(t.href)}>
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="hidden md:block flex-1" />

        {/* â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="relative flex-1 md:flex-none flex items-center group">
          <span className="absolute left-3.5 text-text3 pointer-events-none leading-none">{IcSearch}</span>
          <input className="py-2.5 px-4 pl-10 bg-surface border border-border rounded-full text-text text-[16px] md:text-[13px] font-sans w-full md:w-[220px] transition-all duration-300 ease-out focus:border-border2 focus:outline-none placeholder:text-text3" placeholder="Search..." />
        </div>

        {/* â”€â”€ Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <button onClick={() => setShowFilter(true)} className="bg-surface text-text2 py-2.5 px-2.5 md:py-2 md:px-4 rounded-full border border-border text-[12.5px] font-sans font-semibold inline-flex items-center justify-center cursor-pointer transition-all duration-300 ease-out hover:border-border2 hover:text-text active:scale-96 relative md:gap-1.5">
          {IcFilter} <span className="hidden md:inline">Filter</span>
          {filterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 md:-top-1.5 md:-right-1.5 min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[9.5px] font-extrabold flex items-center justify-center px-1">
              {filterCount}
            </span>
          )}
        </button>

        {/* â”€â”€ Date range â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <button onClick={() => setShowDate(true)} className="bg-surface text-text2 py-2.5 px-2.5 md:py-2 md:px-4 rounded-full border border-border text-[12.5px] font-sans font-semibold inline-flex items-center justify-center cursor-pointer transition-all duration-300 ease-out hover:border-border2 hover:text-text active:scale-96 md:gap-1.5">
          {IcCal}
          <span className="hidden md:block max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
            {filter.dateFrom ? filter.dateFrom.slice(5) + (filter.dateTo ? " â€“ " + filter.dateTo.slice(5) : "") : "Date Range"}
          </span>
        </button>

        {/* â”€â”€ Add trade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center justify-center font-sans font-bold text-[12.5px] tracking-[-0.01em] cursor-pointer transition-all duration-300 ease-out active:scale-96 bg-pill text-[var(--pill-t)] p-2.5 md:py-[9px] md:px-[18px] rounded-full hover:opacity-[.88] hover:-translate-y-[1px] md:gap-1.5">
          {IcPlus} <span className="hidden md:inline">Add Trade</span>
        </button>

        <div className="hidden md:block w-[1px] h-[22px] bg-border mx-1" />

        {/* â”€â”€ MT5 status chip (Hidden on mobile since it's inside `More` Bottom Bar tab) â”€â”€ */}
        <button
          onClick={() => setShowMT5(true)}
          className={`hidden md:flex items-center gap-2 py-2 px-4 rounded-full cursor-pointer text-[12.5px] font-semibold transition-all duration-300 ${isConnected ? "bg-green-bg border border-green-br text-green" : "bg-surface2 border border-border text-text3"}`}
        >
          {isConnected ? (
            <div className="relative inline-flex w-2 h-2 shrink-0">
              <span className="block w-2 h-2 rounded-full bg-green" />
              <div className="absolute inset-0 rounded-full bg-green animate-[ping_1.8s_cubic-bezier(0,0,.2,1)_infinite] opacity-50" />
            </div>
          ) : (
            <div className="w-2 h-2 rounded-full bg-text3 shrink-0" />
          )}
          {isConnected ? (account ? `#${account.login}` : "Live") : "Connect MT5"}
        </button>
      </header>

      {showMT5 && <MT5ConnectModal onClose={() => setShowMT5(false)} />}
      {showFilter && <FilterModal trades={all} onClose={() => setShowFilter(false)} />}
      {showDate && <DateRangeModal onClose={() => setShowDate(false)} />}
      {showAdd && <AddTradeModal onClose={() => setShowAdd(false)} />}
    </>
  );
}
