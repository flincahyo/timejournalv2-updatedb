/**
 * lib/auth.ts
 * Auth calls via FastAPI backend — replaces localStorage-based auth.
 * JWT token stored in localStorage via lib/api.ts helpers.
 */

import { apiPost, setToken, clearToken, getToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function authRegister(
  name: string,
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; user?: AuthUser }> {
  try {
    const res = await apiPost<AuthResponse>("/api/auth/register", { name, email, password });
    setToken(res.token);
    return { ok: true, user: res.user };
  } catch (e: any) {
    return { ok: false, error: e.message || "Registrasi gagal." };
  }
}

export async function authLogin(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; user?: AuthUser }> {
  try {
    const res = await apiPost<AuthResponse>("/api/auth/login", { email, password });
    setToken(res.token);
    return { ok: true, user: res.user };
  } catch (e: any) {
    return { ok: false, error: e.message || "Login gagal." };
  }
}

export async function authGetMe(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const { apiGet } = await import("@/lib/api");
    return await apiGet<AuthUser>("/api/auth/me");
  } catch {
    clearToken();
    return null;
  }
}

export function clearSession() {
  clearToken();
}

/** @deprecated — use authGetMe() for SSR-safe session check */
export function loadSession(): AuthUser | null {
  // For client components that need a sync check: read token existence only
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  // Decode JWT payload (no verify — just read claims for UI)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearToken();
      return null;
    }
    return null; // will be populated by authGetMe() on mount
  } catch {
    return null;
  }
}

/** Keep for Google demo compat — logs in as demo user */
export async function authGoogleDemo(): Promise<AuthUser | null> {
  try {
    const res = await apiPost<AuthResponse>("/api/auth/login", {
      email: "demo@gmail.com",
      password: "demo123456",
    });
    setToken(res.token);
    return res.user;
  } catch {
    // Try register first if not found
    try {
      const res = await apiPost<AuthResponse>("/api/auth/register", {
        name: "Demo Trader",
        email: "demo@gmail.com",
        password: "demo123456",
      });
      setToken(res.token);
      return res.user;
    } catch {
      return null;
    }
  }
}
