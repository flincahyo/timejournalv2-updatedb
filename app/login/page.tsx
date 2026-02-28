"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store";
import { authLogin, authRegister, authGoogleDemo, authGetMe } from "@/lib/auth";
import { getToken } from "@/lib/api";

/* ─── Running Clock + Animated Candlestick Overlay ───────────────────────── */
function ArtWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const s = time.getSeconds();
  const m = time.getMinutes() + s / 60;
  const h = (time.getHours() % 12) + m / 60;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const hDeg = (h / 12) * 360;
  const mDeg = (m / 60) * 360;
  // Second hand used only for smooth updates, or we can just animate minute/hour
  // User wanted same exact look, so 1 white hand (hour), 1 grey hand (minute).
  // We'll map the white hand to Hour, grey to Minute.

  const candles = [
    { o: 80, c: 60, h: 50, l: 90, bull: false },
    { o: 60, c: 85, h: 55, l: 95, bull: true },
    { o: 85, c: 70, h: 65, l: 100, bull: false },
    { o: 70, c: 110, h: 60, l: 120, bull: true },
    { o: 110, c: 90, h: 80, l: 130, bull: false },
    { o: 90, c: 130, h: 80, l: 140, bull: true },
    { o: 130, c: 115, h: 105, l: 145, bull: false },
  ];

  return (
    <div className="relative w-[300px] h-[300px] flex items-center justify-center">
      {/* Container styling similar to the phone in the reference, but minimal */}
      <div className="w-[280px] h-[280px] rounded-[40px] bg-[#1a1514] border border-white/5 shadow-2xl overflow-hidden relative flex items-center justify-center">

        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#f97316]/10" />

        {/* Running Minimal Clock */}
        <svg viewBox="0 0 200 200" width="160" height="160" className="absolute opacity-40">
          <circle cx="100" cy="100" r="90" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
          <circle cx="100" cy="100" r="82" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
          {/* Hour markers */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <line
              key={deg}
              x1={100 + Math.sin((deg * Math.PI) / 180) * 85}
              y1={100 - Math.cos((deg * Math.PI) / 180) * 85}
              x2={100 + Math.sin((deg * Math.PI) / 180) * 90}
              y2={100 - Math.cos((deg * Math.PI) / 180) * 90}
              stroke="white" strokeWidth={deg % 90 === 0 ? "2" : "1"} opacity={deg % 90 === 0 ? "0.8" : "0.3"}
            />
          ))}
          {/* Hands */}
          <line
            x1="100" y1="100"
            x2={100 + Math.sin(toRad(hDeg)) * 40}
            y2={100 - Math.cos(toRad(hDeg)) * 40}
            stroke="white" strokeWidth="3" strokeLinecap="round"
            style={{ transition: "all .5s cubic-bezier(.4,0,.2,1)" }}
          />
          <line
            x1="100" y1="100"
            x2={100 + Math.sin(toRad(mDeg)) * 40}
            y2={100 - Math.cos(toRad(mDeg)) * 40}
            stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"
            style={{ transition: "all .5s cubic-bezier(.4,0,.2,1)" }}
          />
          <circle cx="100" cy="100" r="4" fill="#f97316" />
        </svg>

        {/* Animated Candlestick Passes Through */}
        <div className="absolute inset-0 z-10" style={{ maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)" }}>
          {/* Scroll wrapper */}
          <div className="w-[600px] h-full absolute left-0 top-0 flex items-center" style={{ animation: "scrollCandle 6s linear infinite" }}>
            <svg viewBox="0 0 600 280" className="w-[600px] h-[280px]">
              {/* Double array for seamless scroll */}
              {[...candles, ...candles, ...candles].map((c, i) => {
                const x = 40 + i * 36;
                const top = Math.min(c.o, c.c);
                const height = Math.abs(c.o - c.c) || 2;
                const color = c.bull ? "#10b981" : "#f43f5e";
                return (
                  <g key={i}>
                    {/* Wick */}
                    <line x1={x + 6} y1={c.h} x2={x + 6} y2={c.l} stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
                    {/* Body */}
                    <rect x={x} y={top} width="12" height={height} rx="2" fill={color} opacity="0.95" />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Bottom icon to match reference */}
        <div className="absolute bottom-6 flex gap-3">
          <div className="w-5 h-5 rounded-md border border-white/20 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-[#10b981]" /></div>
          <div className="w-5 h-5 rounded-md border border-[#f97316]/40 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-[#f97316]" /></div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  // Track focus vs filled state for smooth background transition
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!user && getToken()) {
      authGetMe().then((u) => {
        if (u) setUser({ id: u.id, email: u.email, name: u.name, provider: "credentials", createdAt: u.createdAt });
      });
    }
  }, []);

  useEffect(() => { if (user) router.replace("/dashboard"); }, [user]);
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

  const inputStyle = (field: string, val: string): React.CSSProperties => {
    const isFilled = val.length > 0;
    const isFocused = focusedField === field;
    return {
      width: "100%",
      padding: "16px 22px",
      borderRadius: "999px", // Pill shape from ref
      border: `1px solid ${isFocused ? "#ea580c" : "#e5e7eb"}`,
      // Background changes to white when filled, light grey when empty
      background: isFilled || isFocused ? "#ffffff" : "#f8fafc",
      fontSize: "14.5px",
      color: "#0f172a",
      outline: "none",
      transition: "all 0.2s ease",
      fontFamily: "inherit",
    };
  };

  return (
    <>
      <style>{`
        @keyframes scrollCandle {
          from { transform: translateX(0); }
          to { transform: translateX(-252px); } /* 7 candles * 36px spacing */
        }
        @keyframes subtleZoom {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        input::placeholder { color: #9ca3af; }
        /* Hide scrollbar on mobile if needed */
        ::-webkit-scrollbar { width: 0px; background: transparent; }
      `}</style>

      {/* Main split screen wrapper */}
      <div
        className="min-h-screen flex font-sans"
        style={{ backgroundColor: "#2e2523" }} // Dark earthy tone from reference
      >

        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col relative overflow-hidden" style={{ flex: "1 1 50%", padding: "40px" }}>

          {/* Top text */}
          <div className="text-white/40 text-[13px] tracking-wide mt-4 ml-8">
            Track smarter – automated trading journals for you.
          </div>

          {/* Center graphic (wireframe circles) & Headline */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-[-100px]">
            {/* Concentric circles */}
            <div className="absolute w-[400px] h-[400px] rounded-full border border-white/5" />
            <div className="absolute w-[500px] h-[500px] rounded-full border border-white/5" />
            <div className="absolute w-[600px] h-[600px] rounded-full border border-white/5" />
            {/* Crosshairs */}
            <div className="absolute w-[600px] h-[1px] bg-white/5" />
            <div className="absolute w-[1px] h-[600px] bg-white/5" />

            <h1 className="relative z-10 text-[64px] font-bold text-white leading-[1.05] tracking-tight text-center max-w-[400px]">
              Track<br />your trades
            </h1>
          </div>

          {/* Bottom left widget */}
          <div className="absolute bottom-16 left-16 z-20">
            <ArtWidget />
          </div>

          {/* Bottom center watermark icon (from ref) */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-20 text-[#f97316]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </div>
        </div>

        {/* ── RIGHT PANEL (White Area) ───────────────────────────────── */}
        <div
          className="flex flex-col relative bg-white w-full lg:w-[600px] xl:w-[700px] flex-shrink-0 lg:rounded-l-[40px] shadow-2xl z-30"
          style={{ padding: "40px 60px" }}
        >

          {/* Top nav inside white panel */}
          <div className="flex justify-between items-center w-full mb-auto pb-10">
            {/* Brand Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f97316, #e11d48)" }}>
                <div className="w-4 h-4 rounded-full bg-white" />
              </div>
              <span className="text-[20px] font-bold text-[#0f172a] tracking-tight">TimeJournal</span>
            </div>

            {/* Top Right Actions */}
            <button
              onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
              className="flex items-center gap-2 text-[14px] text-[#475569] hover:text-[#0f172a] font-medium transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </div>

          {/* Center Form Area */}
          <div className="w-full max-w-[420px] mx-auto my-auto py-10">
            <h2 className="text-[42px] font-semibold text-[#0f172a] tracking-[-1px] mb-10">
              {mode === "login" ? "Sign In" : "Sign Up"}
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

              {mode === "register" && (
                <div>
                  <input
                    style={inputStyle("name", name)}
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Full Name" required
                    onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)}
                  />
                </div>
              )}

              <div>
                <input
                  style={inputStyle("email", email)}
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Email or Username" required
                  onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
                />
              </div>

              <div className="relative">
                <input
                  style={{ ...inputStyle("pw", password), paddingRight: "48px" }}
                  type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" required minLength={6}
                  onFocus={() => setFocusedField("pw")} onBlur={() => setFocusedField(null)}
                />
                <button
                  type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-[18px] top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280] transition-colors p-1"
                >
                  {showPw
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  }
                </button>
              </div>

              {error && (
                <div className="text-[13px] text-[#ef4444] px-2">
                  {error}
                </div>
              )}

              {/* Forgot password mimicking the reference */}
              {mode === "login" && (
                <div className="mt-1 mb-4">
                  <span className="text-[13.5px] font-medium text-[#ea580c] cursor-pointer hover:underline px-2">
                    Forgot password?
                  </span>
                </div>
              )}

              {/* Submit Button (Pill, gradient orange to pink) */}
              <button
                type="submit" disabled={loading}
                className="w-full rounded-full py-4 mt-2 flex items-center justify-center gap-3 text-white font-semibold text-[15px] shadow-lg transition-transform hover:-translate-y-[1px] disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(to right, #ea580c, #e11d48)", boxShadow: "0 8px 20px -6px rgba(225,29,72,0.5)" }}
              >
                {loading
                  ? <div className="w-[20px] h-[20px] rounded-full border-[2.5px] border-white/30 border-t-white animate-[spin_1s_linear_infinite]" />
                  : <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    {mode === "login" ? "Sign In" : "Sign Up"}
                  </>
                }
              </button>

            </form>

            <div className="mt-8 flex items-center gap-4">
              <div className="h-[1px] flex-1 bg-[#f1f5f9]" />
              <span className="text-[12px] text-[#cbd5e1] uppercase tracking-wider font-semibold">Or</span>
              <div className="h-[1px] flex-1 bg-[#f1f5f9]" />
            </div>

            {/* Guest button style */}
            <button
              onClick={handleGoogle} disabled={loading}
              className="w-full mt-8 rounded-full py-[14px] border border-[#e2e8f0] bg-white text-[#475569] font-medium text-[14.5px] flex items-center justify-center gap-2.5 hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              Sign in as Guest (Demo)
            </button>
          </div>

          {/* Footer inside white panel */}
          <div className="mt-auto pt-10 flex justify-between items-center text-[11px] text-[#9ca3af]">
            <div>© 2025 TimeJournal Inc.</div>
            <div className="flex gap-6">
              <span className="cursor-pointer hover:text-[#475569]">Contact Us</span>
              <span className="cursor-pointer hover:text-[#475569] flex items-center gap-1">
                English <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
