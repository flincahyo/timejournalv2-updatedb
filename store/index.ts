import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Trade, TradeFilter, MT5Account, User, Theme, DEFAULT_FILTER } from "@/types";
import { calcStats, applyFilter, toWIB, detectSession } from "@/lib/utils";
import { apiGet, apiPost, apiPut, apiDelete, buildWsUrl, getToken } from "@/lib/api";

// ── Auth Store ────────────────────────────────────────────────────────────────
interface AuthStore {
  user: User | null;
  token: string | null;
  setUser: (u: User | null) => void;
  setToken: (t: string | null) => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
}));

// ── MT5 Connection Store ──────────────────────────────────────────────────────
interface MT5Store {
  isConnected: boolean;
  account: MT5Account | null;
  lastSync: string | null;
  connectionParams: { login: number; server: string } | null;
  trades: Trade[];
  liveTrades: Trade[];
  isLoading: boolean;

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
  setLoading: (v: boolean) => void;

  /** Connect to MT5 via API and start WebSocket */
  connectMT5: (login: number, password: string, server: string) => Promise<{ success: boolean; message?: string }>;
  /** Disconnect from MT5 via API */
  disconnectMT5: () => Promise<void>;
  /** Load current MT5 status from API (for page refresh) */
  loadStatus: () => Promise<void>;
  /** Fetch all trades from DB cache */
  fetchTrades: () => Promise<void>;
  /** Start WebSocket listener for live updates */
  startWebSocket: () => void;
}

let _ws: WebSocket | null = null;

export const useMT5Store = create<MT5Store>()((set, get) => ({
  isConnected: false,
  account: null,
  lastSync: null,
  connectionParams: null,
  trades: [],
  liveTrades: [],
  isLoading: false,

  setConnected: (isConnected) => set({ isConnected }),
  setAccount: (account) => set({ account }),
  setLastSync: (lastSync) => set({ lastSync }),
  setConnectionParams: (connectionParams) => set({ connectionParams }),
  setTrades: (trades) => set({ trades }),
  setLiveTrades: (liveTrades) => set({ liveTrades }),
  setLoading: (isLoading) => set({ isLoading }),

  updateLiveTrade: (trade) => {
    const { liveTrades } = get();
    const idx = liveTrades.findIndex((t) => t.id === trade.id);
    if (idx >= 0) {
      const updated = [...liveTrades];
      updated[idx] = trade;
      set({ liveTrades: updated });
    } else {
      set({ liveTrades: [...liveTrades, trade] });
    }
  },

  updateTrade: (id, partial) =>
    set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, ...partial } : t)) })),

  deleteTrade: (id) =>
    set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })),

  reset: () =>
    set({ isConnected: false, account: null, connectionParams: null, trades: [], liveTrades: [] }),

  connectMT5: async (login, password, server) => {
    set({ isLoading: true });
    try {
      const res = await apiPost<{
        success: boolean; message?: string; account?: MT5Account;
        trades?: Trade[]; live_trades?: Trade[];
      }>("/api/mt5/connect", { login, password, server });

      if (res.success) {
        set({
          isConnected: true,
          connectionParams: { login, server },
          account: res.account || null,
          trades: (res.trades || []).map(hydrateTrade),
          liveTrades: res.live_trades || [],
          isLoading: false,
        });
        // Start WebSocket for live updates
        get().startWebSocket();
        return { success: true, message: res.message };
      }
      set({ isLoading: false });
      return { success: false, message: res.message };
    } catch (e: any) {
      set({ isLoading: false });
      return { success: false, message: e.message };
    }
  },

  disconnectMT5: async () => {
    try {
      await apiPost("/api/mt5/disconnect");
    } catch { }
    if (_ws) { _ws.close(); _ws = null; }
    get().reset();
  },

  loadStatus: async () => {
    if (!getToken()) return;
    try {
      const status = await apiGet<{
        connected: boolean; account: MT5Account | null;
        lastSync: string | null; login: number | null; server: string | null;
      }>("/api/mt5/status");

      set({
        isConnected: status.connected,
        account: status.account,
        lastSync: status.lastSync,
        connectionParams: status.login ? { login: status.login, server: status.server || "" } : null,
      });

      if (status.connected) {
        get().fetchTrades();
        get().startWebSocket();
      }
    } catch { }
  },

  fetchTrades: async () => {
    try {
      const res = await apiGet<{ trades: Trade[] }>("/api/mt5/trades");
      set({ trades: (res.trades || []).map(hydrateTrade) });
    } catch { }
  },

  startWebSocket: () => {
    if (_ws && _ws.readyState <= 1) return; // already open/connecting
    const url = buildWsUrl("/ws/mt5");
    _ws = new WebSocket(url);

    _ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const { type } = msg;
        if (type === "account_update") {
          set({ account: msg.account, lastSync: new Date().toISOString() });
        } else if (type === "live_trades") {
          set({ liveTrades: (msg.trades || []).map(hydrateTrade) });
        } else if (type === "all_trades" || type === "history_batch") {
          const incoming = (msg.trades || []).map(hydrateTrade);
          const { trades: existing } = get();

          // Merge and remove duplicates by ID
          const merged = [...incoming];
          existing.forEach(t => {
            if (!merged.find(m => m.id === t.id)) merged.push(t);
          });

          // Sort by time descending
          merged.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
          set({ trades: merged });
        } else if (type === "new_trade") {
          const { trades } = get();
          const id = msg.trade.id;
          if (!trades.find((t) => t.id === id)) {
            set({ trades: [hydrateTrade(msg.trade), ...trades] });
          }
        } else if (type === "connected") {
          set({ isConnected: true, account: msg.account });
        }
      } catch { }
    };

    _ws.onclose = () => {
      _ws = null;
      // Auto-reconnect after 5s if still connected
      if (get().isConnected) {
        setTimeout(() => get().startWebSocket(), 5000);
      }
    };
  },
}));

// ── Filter Store ──────────────────────────────────────────────────────────────
interface FilterStore {
  filter: TradeFilter;
  setFilter: (f: Partial<TradeFilter>) => void;
  resetFilter: () => void;
}

export const useFilterStore = create<FilterStore>()((set) => ({
  filter: DEFAULT_FILTER,
  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
  resetFilter: () => set({ filter: DEFAULT_FILTER }),
}));

// ── Theme Store ───────────────────────────────────────────────────────────────
interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: "light",
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        // Persist to server (non-blocking)
        apiPut("/api/settings", { theme: next }).catch(() => { });
      },
      setTheme: (theme) => {
        set({ theme });
        apiPut("/api/settings", { theme }).catch(() => { });
      },
    }),
    { name: "theme-store" } // keep localStorage fallback for theme (fast)
  )
);

// ── News Notification Store ───────────────────────────────────────────────────
export interface NewsSettings {
  enabled: boolean;
  currencies: string[];
  impacts: string[];
  minutesBefore: number;
}

interface NewsStore {
  settings: NewsSettings;
  updateSettings: (partial: Partial<NewsSettings>) => void;
  notifiedIds: string[];
  markNotified: (id: string) => void;
  clearOldNotified: () => void;
  loadFromServer: () => Promise<void>;
}

export const useNewsStore = create<NewsStore>()(
  persist(
    (set, get) => ({
      settings: { enabled: false, currencies: ["USD"], impacts: ["High"], minutesBefore: 5 },
      updateSettings: (partial) => {
        const next = { ...get().settings, ...partial };
        set({ settings: next });
        apiPut("/api/settings", { newsSettings: next }).catch(() => { });
      },
      notifiedIds: [],
      markNotified: (id) =>
        set((s) => ({ notifiedIds: s.notifiedIds.includes(id) ? s.notifiedIds : [...s.notifiedIds, id].slice(-200) })),
      clearOldNotified: () => set({ notifiedIds: [] }),
      loadFromServer: async () => {
        try {
          const res = await apiGet<{ newsSettings: NewsSettings }>("/api/settings");
          if (res.newsSettings) set({ settings: res.newsSettings });
        } catch { }
      },
    }),
    { name: "news-store" }
  )
);

// ── Alert Store ───────────────────────────────────────────────────────────────
export interface CandleAlert {
  id: string; type: "candle"; symbol: string; timeframe: string;
  minBodyPips: number; maxWickPercent: number; soundUri: string; enabled: boolean;
}

export interface PriceAlert {
  id: string; type: "price"; symbol: string; trigger: "Above" | "Below" | "Crosses";
  targetPrice: number; frequency: "Once" | "Everytime"; notes: string; enabled: boolean; soundUri: string;
}

export type AnyAlert = CandleAlert | PriceAlert;

export interface AlertToast {
  id: string; title: string; message: string; type: "bullish" | "bearish";
}

interface AlertStore {
  alerts: AnyAlert[];
  addAlert: (alert: Omit<CandleAlert, "id"> | Omit<PriceAlert, "id">) => Promise<void>;
  updateAlert: (id: string, partial: Partial<CandleAlert> | Partial<PriceAlert>) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  notifiedIds: string[];
  markNotified: (id: string) => void;
  clearOldNotified: () => void;
  activeToasts: AlertToast[];
  addToast: (toast: Omit<AlertToast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useAlertStore = create<AlertStore>()((set, get) => ({
  alerts: [],

  fetchAlerts: async () => {
    try {
      const res = await apiGet<{ alerts: AnyAlert[] }>("/api/alerts");
      set({ alerts: res.alerts || [] });
    } catch { }
  },

  addAlert: async (alert) => {
    try {
      const res = await apiPost<{ ok: boolean; alert: AnyAlert }>("/api/alerts", { data: alert });
      if (res.ok) set((s) => ({ alerts: [...s.alerts, res.alert] }));
    } catch { }
  },

  updateAlert: async (id, partial) => {
    try {
      const res = await apiPut<{ ok: boolean; alert: AnyAlert }>(`/api/alerts/${id}`, { partial });
      if (res.ok) set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? res.alert : a)) }));
    } catch { }
  },

  deleteAlert: async (id) => {
    try {
      await apiDelete(`/api/alerts/${id}`);
      set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }));
    } catch { }
  },

  notifiedIds: [],
  markNotified: (id) =>
    set((s) => ({
      notifiedIds: s.notifiedIds.includes(id) ? s.notifiedIds : [...s.notifiedIds, id].slice(-500),
    })),
  clearOldNotified: () => set({ notifiedIds: [] }),

  activeToasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((s) => ({ activeToasts: [...s.activeToasts, { ...toast, id }] }));
    setTimeout(() => set((s) => ({ activeToasts: s.activeToasts.filter((t) => t.id !== id) })), 5000);
  },
  removeToast: (id) => set((s) => ({ activeToasts: s.activeToasts.filter((t) => t.id !== id) })),
}));

// ── Journal Store ─────────────────────────────────────────────────────────────
interface JournalStore {
  notes: Record<string, string>;
  dailyTags: Record<string, string[]>;
  tags: string[];
  isLoaded: boolean;

  fetchJournal: () => Promise<void>;
  setNote: (day: string, text: string) => void;
  toggleDailyTag: (day: string, tag: string) => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
}

export const useJournalStore = create<JournalStore>()((set, get) => ({
  notes: {},
  dailyTags: {},
  tags: ["Followed Plan", "FOMO", "Revenge Trading", "Impatient", "Good Setup", "News Event"],
  isLoaded: false,

  fetchJournal: async () => {
    try {
      const res = await apiGet<{ notes: Record<string, string>; tags: string[]; dailyTags: Record<string, string[]> }>("/api/journal");
      set({ notes: res.notes || {}, tags: res.tags || [], dailyTags: res.dailyTags || {}, isLoaded: true });
    } catch { }
  },

  setNote: (day, text) => {
    set((s) => ({ notes: { ...s.notes, [day]: text } }));
    apiPost("/api/journal/note", { day, text }).catch(() => { });
  },

  toggleDailyTag: (day, tag) => {
    const current = get().dailyTags[day] || [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    set((s) => ({ dailyTags: { ...s.dailyTags, [day]: next } }));
    apiPost("/api/journal/daily-tag/toggle", { day, tag }).catch(() => { });
  },

  addTag: (tag) => {
    set((s) => ({ tags: s.tags.includes(tag) ? s.tags : [...s.tags, tag] }));
    apiPost("/api/journal/tag", { name: tag }).catch(() => { });
  },

  removeTag: (tag) => {
    set((s) => ({ tags: s.tags.filter((t) => t !== tag) }));
    apiDelete("/api/journal/tag", { name: tag }).catch(() => { });
  },
}));

// ── Hydration helper ──────────────────────────────────────────────────────────
function hydrateTrade(t: Trade): Trade {
  const status = (typeof t.status === "string" ? t.status.toLowerCase() : "closed") as "closed" | "live";
  const openTimeWIB = t.openTimeWIB || (t.openTime ? toWIB(t.openTime) : "");
  const closeTimeWIB = t.closeTimeWIB || (t.closeTime ? toWIB(t.closeTime) : "");
  let session = t.session;
  if (!session || session === "Unknown") {
    session = openTimeWIB ? detectSession(openTimeWIB) : "Unknown";
  }
  const durationMs =
    t.durationMs ||
    (t.openTime && t.closeTime
      ? Math.max(new Date(t.closeTime).getTime() - new Date(t.openTime).getTime(), 0)
      : 0);
  return { ...t, status, openTimeWIB, closeTimeWIB, session, durationMs };
}

// ── Computed hook ─────────────────────────────────────────────────────────────
export function useFilteredTrades() {
  const { trades, liveTrades } = useMT5Store();
  const { filter } = useFilterStore();
  const all = [...trades, ...liveTrades].map(hydrateTrade);
  const filtered = applyFilter(all, filter);
  const stats = calcStats(filtered);
  return { all, filtered, stats };
}
