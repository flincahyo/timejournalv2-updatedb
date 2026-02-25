import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Trade, TradeFilter, MT5Account, User, Theme, DEFAULT_FILTER } from "@/types";
import { calcStats, applyFilter, toWIB, detectSession } from "@/lib/utils";

// â”€â”€ Auth Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface AuthStore {
  user: User | null;
  setUser: (u: User | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    { name: "auth-store" }
  )
);

// â”€â”€ MT5 Connection Store (persisted per user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface MT5Store {
  isConnected: boolean;
  account: MT5Account | null;
  lastSync: string | null;
  connectionParams: { login: number; server: string } | null;
  trades: Trade[];
  liveTrades: Trade[];
  setConnected: (v: boolean) => void;
  setAccount: (a: MT5Account | null) => void;
  setLastSync: (s: string) => void;
  setConnectionParams: (p: { login: number; server: string } | null) => void;
  setTrades: (t: Trade[]) => void;
  setLiveTrades: (t: Trade[]) => void;
  updateLiveTrade: (t: Trade) => void;
  updateTrade: (id: string, partial: Partial<Trade>) => void;
  deleteTrade: (id: string) => void;
  reset: () => void;
}

export const useMT5Store = create<MT5Store>()(
  persist(
    (set, get) => ({
      isConnected: false,
      account: null,
      lastSync: null,
      connectionParams: null,
      trades: [],
      liveTrades: [],
      setConnected: (isConnected) => set({ isConnected }),
      setAccount: (account) => set({ account }),
      setLastSync: (lastSync) => set({ lastSync }),
      setConnectionParams: (connectionParams) => set({ connectionParams }),
      setTrades: (trades) => set({ trades }),
      setLiveTrades: (liveTrades) => set({ liveTrades }),
      updateLiveTrade: (trade) => {
        const { liveTrades } = get();
        const idx = liveTrades.findIndex(t => t.id === trade.id);
        if (idx >= 0) {
          const updated = [...liveTrades];
          updated[idx] = trade;
          set({ liveTrades: updated });
        } else {
          set({ liveTrades: [...liveTrades, trade] });
        }
      },
      updateTrade: (id, partial) => set((s) => ({
        trades: s.trades.map(t => t.id === id ? { ...t, ...partial } : t)
      })),
      deleteTrade: (id) => set((s) => ({
        trades: s.trades.filter(t => t.id !== id)
      })),
      reset: () => set({ isConnected: false, account: null, connectionParams: null, trades: [], liveTrades: [] }),
    }),
    {
      name: "mt5-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// â”€â”€ Filter Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface FilterStore {
  filter: TradeFilter;
  setFilter: (f: Partial<TradeFilter>) => void;
  resetFilter: () => void;
}

export const useFilterStore = create<FilterStore>()((set) => ({
  filter: DEFAULT_FILTER,
  setFilter: (f) => set(s => ({ filter: { ...s.filter, ...f } })),
  resetFilter: () => set({ filter: DEFAULT_FILTER }),
}));

// â”€â”€ Theme Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      toggleTheme: () => set(s => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "theme-store" }
  )
);

// â”€â”€ News Notification Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface NewsSettings {
  enabled: boolean;
  currencies: string[]; // e.g. ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"]
  impacts: string[];    // e.g. ["High", "Medium", "Low"]
  minutesBefore: number; // e.g. 5, 15, 30
}

interface NewsStore {
  settings: NewsSettings;
  updateSettings: (partial: Partial<NewsSettings>) => void;
  notifiedIds: string[];
  markNotified: (id: string) => void;
  clearOldNotified: () => void; // call occasionally to prune array
}

export const useNewsStore = create<NewsStore>()(
  persist(
    (set) => ({
      settings: {
        enabled: false,
        currencies: ["USD"],
        impacts: ["High"],
        minutesBefore: 5,
      },
      updateSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),
      notifiedIds: [],
      markNotified: (id) => set((s) => {
        if (s.notifiedIds.includes(id)) return s;
        return { notifiedIds: [...s.notifiedIds, id].slice(-200) }; // keeping last 200 is plenty
      }),
      clearOldNotified: () => set({ notifiedIds: [] }),
    }),
    { name: "news-store" }
  )
);

export interface CandleAlert {
  id: string;
  type: "candle";
  symbol: string;
  timeframe: string;
  minBodyPips: number;
  maxWickPercent: number;
  soundUri: string;
  enabled: boolean;
}

export interface PriceAlert {
  id: string;
  type: "price";
  symbol: string;
  trigger: "Above" | "Below" | "Crosses";
  targetPrice: number;
  frequency: "Once" | "Everytime";
  notes: string;
  enabled: boolean;
  soundUri: string;
}

export type AnyAlert = CandleAlert | PriceAlert;

export interface AlertToast {
  id: string;
  title: string;
  message: string;
  type: "bullish" | "bearish";
}

interface AlertStore {
  alerts: AnyAlert[];
  addAlert: (alert: Omit<CandleAlert, 'id'> | Omit<PriceAlert, 'id'>) => void;
  updateAlert: (id: string, partial: Partial<CandleAlert> | Partial<PriceAlert>) => void;
  deleteAlert: (id: string) => void;
  notifiedIds: string[]; // Format: "alertId_candleTimestamp"
  markNotified: (id: string) => void;
  clearOldNotified: () => void;

  // Ephemeral Toasts
  activeToasts: AlertToast[];
  addToast: (toast: Omit<AlertToast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useAlertStore = create<AlertStore>()(
  persist(
    (set) => ({
      alerts: [],
      addAlert: (alert) => set((s) => ({
        alerts: [...s.alerts, { ...alert, id: Math.random().toString(36).substring(2, 9) } as AnyAlert]
      })),
      updateAlert: (id, partial) => set((s) => ({
        alerts: s.alerts.map(a => a.id === id ? { ...a, ...partial } as AnyAlert : a)
      })),
      deleteAlert: (id) => set((s) => ({
        alerts: s.alerts.filter(a => a.id !== id)
      })),
      notifiedIds: [],
      markNotified: (id) => set((s) => {
        if (s.notifiedIds.includes(id)) return s;
        return { notifiedIds: [...s.notifiedIds, id].slice(-500) };
      }),
      clearOldNotified: () => set({ notifiedIds: [] }),

      activeToasts: [],
      addToast: (toast) => {
        const id = Math.random().toString(36).substring(2, 9);
        set((s) => ({ activeToasts: [...s.activeToasts, { ...toast, id }] }));
        // Auto remove after 5s
        setTimeout(() => set((s) => ({ activeToasts: s.activeToasts.filter(t => t.id !== id) })), 5000);
      },
      removeToast: (id) => set((s) => ({ activeToasts: s.activeToasts.filter(t => t.id !== id) }))
    }),
    {
      name: "alert-store",
      partialize: (state) => ({
        alerts: state.alerts,
        notifiedIds: state.notifiedIds
      }) // Do not persist activeToasts
    }
  )
);


// â”€â”€ Computed hook: filtered trades + stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// Hydrate a trade: backfills computed fields absent in persisted / manually-added trades
function hydrateTrade(t: Trade): Trade {
  // Normalize status casing
  const status = (typeof t.status === "string"
    ? t.status.toLowerCase()
    : "closed") as "closed" | "live";

  // Backfill WIB timestamps
  const openTimeWIB  = t.openTimeWIB  || (t.openTime  ? toWIB(t.openTime)  : "");
  const closeTimeWIB = t.closeTimeWIB || (t.closeTime ? toWIB(t.closeTime) : "");

  // Backfill session
  let session = t.session;
  if (!session || session === "Unknown") {
    session = openTimeWIB ? detectSession(openTimeWIB) : "Unknown";
  }

  // Backfill durationMs
  const durationMs = t.durationMs ||
    (t.openTime && t.closeTime
      ? Math.max(new Date(t.closeTime).getTime() - new Date(t.openTime).getTime(), 0)
      : 0);

  return { ...t, status, openTimeWIB, closeTimeWIB, session, durationMs };
}

export function useFilteredTrades() {
  const { trades, liveTrades } = useMT5Store();
  const { filter } = useFilterStore();
  const all = [...trades, ...liveTrades].map(hydrateTrade);
  const filtered = applyFilter(all, filter);
  const stats = calcStats(filtered);
  return { all, filtered, stats };
}

// â”€â”€ Journal Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface JournalStore {
  notes: Record<string, string>; // keyed by day (e.g., "2024-05-08")
  dailyTags: Record<string, string[]>; // keyed by day implicitly
  tags: string[]; // custom universal tags
  setNote: (day: string, text: string) => void;
  toggleDailyTag: (day: string, tag: string) => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      notes: {},
      dailyTags: {},
      tags: ["Followed Plan", "FOMO", "Revenge Trading", "Impatient", "Good Setup", "News Event"],
      setNote: (day, text) => set((s) => ({ notes: { ...s.notes, [day]: text } })),
      toggleDailyTag: (day, tag) => {
        const current = get().dailyTags[day] || [];
        const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
        set(s => ({ dailyTags: { ...s.dailyTags, [day]: next } }));
      },
      addTag: (tag) => set((s) => ({ tags: s.tags.includes(tag) ? s.tags : [...s.tags, tag] })),
      removeTag: (tag) => set((s) => ({ tags: s.tags.filter(t => t !== tag) })),
    }),
    { name: "journal-store" }
  )
);
