"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useThemeStore, useAuthStore, useMT5Store } from "@/store";
import { clearSession } from "@/lib/auth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const IC = {
  overview: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  live: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2.5" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.07 4.93a10 10 0 0 1 0 14.14M3.93 19.07a10 10 0 0 1 0-14.14" /></svg>,
  trades: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>,
  watchlist: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  time: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  analytics: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  news: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-3 8H6m1 4H6m4-8H6" /></svg>,
  alerts: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  journal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  sun: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
  moon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  logout: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
};

const DEFAULT_NAV = [
  { id: "overview", href: "/dashboard", icon: "overview", label: "Overview" },
  { id: "live", href: "/dashboard/live", icon: "live", label: "Live Trades" },
  { id: "trades", href: "/dashboard/trades", icon: "trades", label: "All Trades" },
  { id: "watchlist", href: "/dashboard/watchlist", icon: "watchlist", label: "Watchlist" },
  { id: "timemetrics", href: "/dashboard/timemetrics", icon: "time", label: "Time Metrics" },
  { id: "analytics", href: "/dashboard/analytics", icon: "analytics", label: "Analytics" },
  { id: "calendar", href: "/dashboard/calendar", icon: "calendar", label: "Calendar" },
  { id: "news", href: "/dashboard/news", icon: "news", label: "News" },
  { id: "alerts", href: "/dashboard/alerts", icon: "alerts", label: "Alerts" },
  { id: "journal", href: "/dashboard/journal", icon: "journal", label: "Journal" },
];

function SortableNavItem({ item, active, liveTradesCount, onClick }: { item: any; active: boolean; liveTradesCount: number; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative w-full flex items-center h-[42px] cursor-pointer rounded-full mb-0.5 transition-all duration-200 group/item ${active
        ? "bg-text text-surface shadow-[-2px_4px_10px_rgba(0,0,0,0.15)]"
        : "bg-transparent text-text2 hover:text-text hover:bg-black/5 dark:hover:bg-white/5"
        }`}
      onClick={onClick}
      title={item.label}
    >
      <div
        className="shrink-0 flex items-center justify-center w-[42px] h-[42px] transition-transform duration-200 group-hover/item:scale-105">
        {IC[item.icon as keyof typeof IC]}
        {item.id === "live" && liveTradesCount > 0 && (
          <span className="absolute top-2 left-8 w-[7px] h-[7px] shrink-0 rounded-full bg-green border-[1.5px] border-surface z-10" />
        )}
      </div>
      <span className="ml-2.5 text-[13.5px] font-semibold whitespace-nowrap opacity-0 group-data-[expanded=true]:opacity-100 transition-opacity duration-300">
        {item.label}
      </span>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const { liveTrades } = useMT5Store();
  const router = useRouter();

  const [navItems, setNavItems] = useState(DEFAULT_NAV);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_nav_order");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        const merged = parsed.map(id => DEFAULT_NAV.find(n => n.id === id)).filter(Boolean) as typeof DEFAULT_NAV;
        const missing = DEFAULT_NAV.filter(n => !parsed.includes(n.id));
        setNavItems([...merged, ...missing]);
      } catch (e) {
        console.error("Failed to parse sidebar_nav_order", e);
      }
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px drag intent required, else fires click
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setNavItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem("sidebar_nav_order", JSON.stringify(newItems.map(i => i.id)));
        return newItems;
      });
    }
  };

  const handleLogout = () => { clearSession(); setUser(null); router.replace("/login"); };

  return (
    <aside
      className="group w-[var(--sidebar-w)] data-[expanded=true]:w-[220px] shrink-0 bg-bg flex flex-col h-screen sticky top-0 z-60 pt-4 pb-3 transition-[width] duration-300 ease-out overflow-hidden"
      data-expanded={isExpanded}
    >

      {/* Logo mark */}
      <div
        className="mb-6 px-[10px] flex items-center shrink-0 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        <div className={`w-[44px] h-[44px] shrink-0 rounded-[14px] bg-gradient-to-b flex items-center justify-center shadow-sm ${theme === 'dark' ? 'from-[#F59E0B] to-[#EA580C]' : 'from-[#3B82F6] to-[#2563EB]'}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {/* Speed Timer / Scalper Logo */}
            <circle cx="12" cy="13" r="8" />
            <path d="M12 2v3" strokeWidth="2" />
            <path d="M19 5l-2 2" strokeWidth="2" />
            <path d="M5 5l2 2" strokeWidth="2" />
            <path d="M13 9l-3 4h4l-2 5" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="ml-3 font-extrabold text-[17px] tracking-[-0.04em] whitespace-nowrap opacity-0 group-data-[expanded=true]:opacity-100 transition-opacity duration-300 flex items-center gap-1">
          TimeJournal<span className="text-accent">.</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1.5 w-full px-[10px] overflow-y-auto overflow-x-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={navItems.map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {navItems.map((item) => {
              const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <SortableNavItem
                  key={item.id}
                  item={item}
                  active={active}
                  liveTradesCount={liveTrades.length}
                  onClick={() => router.push(item.href)}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      </nav>

      {/* Divider */}
      <div className="mx-[10px] h-[1px] shrink-0 bg-border my-3" />

      {/* Bottom controls */}
      <div className="flex flex-col gap-1.5 w-full px-[10px] shrink-0 overflow-hidden">
        <div
          className="relative w-full flex items-center h-[42px] cursor-pointer rounded-full mb-0.5 transition-all duration-200 group/item bg-transparent text-text2 hover:text-text hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => toggleTheme()}
          title="Toggle Dark Mode"
        >
          <div className="shrink-0 flex items-center justify-center w-[42px] h-[42px] transition-transform duration-200 group-hover/item:scale-105">
            {theme === 'dark' ? IC.sun : IC.moon}
          </div>
          <span className="ml-2.5 text-[13.5px] font-semibold whitespace-nowrap opacity-0 group-data-[expanded=true]:opacity-100 transition-opacity duration-300">
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        </div>

        {/* User / Logout */}
        <div
          className="relative w-full flex items-center h-[42px] cursor-pointer rounded-full mb-2 transition-all duration-200 group/item bg-transparent text-text2 hover:text-red hover:bg-red/5"
          onClick={handleLogout}
          title="Logout"
        >
          <div className="shrink-0 flex items-center justify-center w-[42px] h-[42px] transition-transform duration-200 group-hover/item:scale-105 hover:bg-red-bg rounded-full">
            {IC.logout}
          </div>
          <span className="ml-2.5 text-[13.5px] font-semibold whitespace-nowrap opacity-0 group-data-[expanded=true]:opacity-100 transition-opacity duration-300">
            Logout
          </span>
        </div>

        {user && (
          <div className="w-full flex items-center h-[42px] rounded-full">
            <div className="w-[36px] h-[36px] ml-[3px] group-data-[expanded=true]:ml-[-5px] shrink-0 rounded-full bg-pill border-2 border-surface flex items-center justify-center text-[10px] font-extrabold text-[var(--pill-t)]">
              {user.name?.slice(0, 2).toUpperCase()}
            </div>
            <div className="ml-3.5 flex flex-col justify-center opacity-0 group-data-[expanded=true]:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              <span className="text-[13px] font-bold text-text leading-tight">{user.name}</span>
              <span className="text-[11px] font-medium text-text3 leading-tight">{user.email || "Trader"}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
