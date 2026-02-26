/**
 * lib/api.ts
 * Central fetch wrapper — auto-attaches JWT token from localStorage.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const TOKEN_KEY = "uj_token";

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

function buildHeaders(extra?: Record<string, string>): HeadersInit {
    const token = getToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...extra,
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            const json = await res.json();
            detail = json.detail || JSON.stringify(json);
        } catch { }
        throw new Error(detail);
    }
    return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method: "GET",
        headers: buildHeaders(),
    });
    return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers: buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method: "PUT",
        headers: buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method: "DELETE",
        headers: buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
}

/** Build WebSocket URL with JWT token as query param */
export function buildWsUrl(path: string): string {
    const token = getToken();
    const base = BACKEND_URL.replace(/^http/, "ws");
    return `${base}${path}${token ? `?token=${token}` : ""}`;
}
