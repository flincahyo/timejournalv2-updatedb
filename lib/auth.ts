/**
 * lib/auth.ts
 * BUG 1 FIX: register wajib email unik, login cek password dari DB
 * BUG 3 FIX: session persist di localStorage — tidak perlu login ulang setelah refresh
 */

const DB_KEY  = "uj_users_db";
const SES_KEY = "uj_session";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

type UserRecord = { user: AuthUser; ph: string };

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

function getDB(): Record<string, UserRecord> {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || "{}"); } catch { return {}; }
}
function putDB(db: Record<string, UserRecord>) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {}
}

// BUG 1: register dengan validasi email unik
export function authRegister(name: string, email: string, password: string): { ok: boolean; error?: string; user?: AuthUser } {
  if (!name.trim())                    return { ok: false, error: "Nama tidak boleh kosong." };
  if (!/\S+@\S+\.\S+/.test(email))     return { ok: false, error: "Format email tidak valid." };
  if (password.length < 6)             return { ok: false, error: "Password minimal 6 karakter." };
  const db = getDB(), key = email.toLowerCase().trim();
  if (db[key])                         return { ok: false, error: "Email sudah terdaftar. Silakan login." };
  const user: AuthUser = { id: "u_" + Date.now(), email: key, name: name.trim(), createdAt: new Date().toISOString() };
  db[key] = { user, ph: hash(password) };
  putDB(db); saveSession(user);
  return { ok: true, user };
}

// BUG 1: login cek email + password dari DB
export function authLogin(email: string, password: string): { ok: boolean; error?: string; user?: AuthUser } {
  const db = getDB(), key = email.toLowerCase().trim(), rec = db[key];
  if (!rec)                            return { ok: false, error: "Email belum terdaftar. Silakan daftar dulu." };
  if (rec.ph !== hash(password))       return { ok: false, error: "Password salah." };
  saveSession(rec.user);
  return { ok: true, user: rec.user };
}

export function authGoogleDemo(): AuthUser {
  const db = getDB(), key = "demo@gmail.com";
  if (!db[key]) {
    const user: AuthUser = { id: "google_demo", email: key, name: "Demo Trader", createdAt: new Date().toISOString() };
    db[key] = { user, ph: "" }; putDB(db);
  }
  saveSession(db[key].user);
  return db[key].user;
}

// BUG 3: session persist — save/load/clear dari localStorage
export function saveSession(u: AuthUser) { try { localStorage.setItem(SES_KEY, JSON.stringify(u)); } catch {} }
export function loadSession(): AuthUser | null { try { return JSON.parse(localStorage.getItem(SES_KEY) || "null"); } catch { return null; } }
export function clearSession() { try { localStorage.removeItem(SES_KEY); } catch {} }
