"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { useMT5Sync } from "@/hooks/useMT5Sync";
import { loadSession } from "@/lib/auth";

function SyncProvider({ children }: { children: React.ReactNode }) {
  useMT5Sync();
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      const ses = loadSession();
      if (ses) {
        setUser({ id: ses.id, email: ses.email, name: ses.name, provider: "credentials", createdAt: ses.createdAt });
        setReady(true);
      } else {
        router.replace("/login");
      }
    } else {
      setReady(true);
    }
  }, []);

  useEffect(() => { if (ready && !user) router.replace("/login"); }, [user, ready]);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3.5">
        <div className="w-9 h-9 rounded-full border-[3px] border-border border-t-accent animate-[spin_1s_linear_infinite]" />
        <p className="text-[13px] text-text3 font-medium">Memuat…</p>
      </div>
    </div>
  );

  return (
    <SyncProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </SyncProvider>
  );
}
