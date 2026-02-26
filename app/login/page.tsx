"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store";
import { authLogin, authRegister, authGoogleDemo, authGetMe } from "@/lib/auth";
import { getToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Restore session from token on mount
    if (!user && getToken()) {
      authGetMe().then((u) => {
        if (u) {
          setUser({ id: u.id, email: u.email, name: u.name, provider: "credentials", createdAt: u.createdAt });
        }
      });
    }
  }, []);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user]);

  if (!mounted) return null;

  const applyUser = (u: { id: string; email: string; name: string; createdAt: string }) => {
    setUser({ id: u.id, email: u.email, name: u.name, provider: "credentials", createdAt: u.createdAt });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");

    if (mode === "register") {
      const res = await authRegister(name, email, password);
      if (!res.ok) { setError(res.error!); setLoading(false); return; }
      applyUser(res.user!);
    } else {
      const res = await authLogin(email, password);
      if (!res.ok) { setError(res.error!); setLoading(false); return; }
      applyUser(res.user!);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const u = await authGoogleDemo();
    if (u) applyUser(u);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center font-sans relative overflow-hidden">
      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(79,70,229,.08),transparent_60%)] pointer-events-none" />
      <div className="absolute -bottom-[100px] -right-[100px] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,.06),transparent_60%)] pointer-events-none" />

      <div className="fade-in w-[420px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-9">
          <div className="inline-flex items-center gap-2.5 bg-surface border border-border rounded-xl py-2.5 px-5 mb-5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg></div>
            <span className="text-[18px] font-extrabold text-text tracking-[-.3px]">TimeJournal</span>
          </div>
          <div className="text-[22px] font-extrabold text-text mb-1.5 tracking-[-.4px]">
            {mode === "login" ? "Selamat Datang Kembali" : "Buat Akun Baru"}
          </div>
          <div className="text-[13px] text-text3">
            {mode === "login" ? "Masuk untuk lanjut ke dashboard" : "Daftar gratis, mulai journal trading kamu"}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[20px] p-8 shadow-s2">
          {/* Google Demo */}
          <button onClick={handleGoogle} disabled={loading} className="w-full py-3 px-5 bg-surface2 hover:bg-surface3 border border-border hover:border-accent rounded-xl flex items-center justify-center gap-2.5 text-text text-[13px] font-semibold mb-5 cursor-pointer transition-all duration-150">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" /><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" /><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" /><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" /></svg>
            Lanjutkan dengan Google (Demo)
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-text3 tracking-[.05em] uppercase">ATAU</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {mode === "register" && (
              <div>
                <label className="text-[11px] text-text3 uppercase tracking-[.05em] block mb-1.5">Nama Lengkap</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nama kamu" required />
              </div>
            )}
            <div>
              <label className="text-[11px] text-text3 uppercase tracking-[.05em] block mb-1.5">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@domain.com" required />
            </div>
            <div>
              <label className="text-[11px] text-text3 uppercase tracking-[.05em] block mb-1.5">
                Password {mode === "register" && <span className="font-normal normal-case">(min. 6 karakter)</span>}
              </label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>

            {error && (
              <div className="bg-red-bg border border-red-border rounded-lg py-2.5 px-3.5 text-[12.5px] text-red flex gap-2 items-start">
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary w-full justify-center py-2.5 text-[14px] mt-1" disabled={loading}>
              {loading
                ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-[spin_1s_linear_infinite]" />
                : mode === "login" ? "Masuk" : "Buat Akun"}
            </button>
          </form>

          <div className="text-center mt-5 text-[13px] text-text3">
            {mode === "login" ? "Belum punya akun? " : "Sudah punya akun? "}
            <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} className="text-accent2 font-semibold">
              {mode === "login" ? "Daftar sekarang" : "Masuk"}
            </button>
          </div>
        </div>
        <div className="text-center mt-4 text-[11px] text-text3">Data tersimpan di server, aman dan bisa diakses dari mana saja.</div>
      </div>
    </div>
  );
}
