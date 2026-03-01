"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, useMT5Store, useJournalStore, useAlertStore, useNewsStore } from "@/store";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { useMT5Sync } from "@/hooks/useMT5Sync";
import { authGetMe } from "@/lib/auth";
import { getToken } from "@/lib/api";

function DataLoader({ children }: { children: React.ReactNode }) {
  useMT5Sync();
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const { loadStatus } = useMT5Store();
  const { fetchJournal } = useJournalStore();
  const { fetchAlerts } = useAlertStore();
  const { loadFromServer: loadNewsSettings } = useNewsStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Clear any stale meta theme-color set by login page, so the
    // React Native status bar defaults back to the dashboard theme
    const staleMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (staleMeta) staleMeta.remove();

    async function bootstrap() {
      if (user) {
        // Already have user in memory — load server data
        await Promise.all([loadStatus(), fetchJournal(), fetchAlerts(), loadNewsSettings()]);
        setReady(true);
        return;
      }
      const token = getToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      // Validate token against server and restore session
      const me = await authGetMe();
      if (!me) {
        router.replace("/login");
        return;
      }
      setUser({ id: me.id, email: me.email, name: me.name, provider: "credentials", createdAt: me.createdAt });
      // Load all server data in parallel after auth confirmed
      await Promise.all([loadStatus(), fetchJournal(), fetchAlerts(), loadNewsSettings()]);
      setReady(true);
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [user, ready]);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3.5">
        <div className="w-9 h-9 rounded-full border-[3px] border-border border-t-accent animate-[spin_1s_linear_infinite]" />
        <p className="text-[13px] text-text3 font-medium">Memuat…</p>
      </div>
    </div>
  );

  return (
    <DataLoader>
      <div className="flex h-screen overflow-hidden">
        {/* Hide Sidebar on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden md:pb-0 pb-[calc(4rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
        </div>
        {/* Mobile bottom tab bar */}
        <MobileTabBar />
      </div>
    </DataLoader>
  );
}
