/**
 * Remote Config Service
 * ─────────────────────
 * Fetches app configuration from a remote JSON file at startup.
 * Falls back to cached config (AsyncStorage) if network is unavailable.
 * Falls back to hardcoded defaults if both fail.
 *
 * To update the server URL without rebuilding the APK:
 *   1. Edit the remote config JSON file (e.g., on GitHub)
 *   2. Commit & push — users get new config on next app launch
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export interface AppConfig {
    webAppUrl: string;
    backendUrl: string;
    appVersion: string;
    maintenanceMode: boolean;
    maintenanceMessage?: string;
}

const CACHE_KEY = '@timejournal_remote_config';
const FETCH_TIMEOUT_MS = 5000;

const DEFAULT_CONFIG: AppConfig = {
    webAppUrl: 'http://192.168.232.72:3000', // Fallback hardcoded URL
    backendUrl: 'http://192.168.232.72:8000',
    appVersion: '1.0.0',
    maintenanceMode: false,
};

/**
 * Fetch remote config with a timeout.
 */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        return res;
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

/**
 * Load app configuration.
 * Priority: Remote → Cache → Default
 */
export async function loadRemoteConfig(): Promise<AppConfig> {
    // Get the remote config URL from app.json extra
    const remoteConfigUrl: string | undefined = Constants.expoConfig?.extra?.remoteConfigUrl;

    if (remoteConfigUrl && !remoteConfigUrl.includes('YOUR_USERNAME')) {
        try {
            const res = await fetchWithTimeout(remoteConfigUrl, FETCH_TIMEOUT_MS);
            if (res.ok) {
                const data: AppConfig = await res.json();
                // Cache the fresh config
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
                console.log('[RemoteConfig] Loaded from network:', data.webAppUrl);
                return data;
            }
        } catch (e) {
            console.warn('[RemoteConfig] Network fetch failed, trying cache...', e);
        }

        // Try cached config
        try {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (cached) {
                const data: AppConfig = JSON.parse(cached);
                console.log('[RemoteConfig] Loaded from cache:', data.webAppUrl);
                return data;
            }
        } catch (e) {
            console.warn('[RemoteConfig] Cache read failed, using defaults', e);
        }
    } else {
        console.log('[RemoteConfig] No remote URL configured — using default config');
    }

    return DEFAULT_CONFIG;
}
