import React, { useRef, useState, useEffect } from 'react';
import { BackHandler, Platform, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { loadRemoteConfig, AppConfig } from './services/remoteConfig';
import { registerForPushNotificationsAsync } from './services/notifications';
import './global.css';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [overrideBg, setOverrideBg] = useState<string | null>(null);

  // Remote config + OTA state
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [otaChecking, setOtaChecking] = useState(false);

  // ── Startup: Remote Config + OTA check ─────────────────────────────────────
  useEffect(() => {
    async function startup() {
      // 1. Check for OTA updates (non-blocking, only in production)
      if (!__DEV__) {
        try {
          setOtaChecking(true);
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            // Reload app to apply the new JS bundle
            await Updates.reloadAsync();
            return; // Will reload — no point continuing
          }
        } catch (e) {
          console.warn('[OTA] Update check failed (offline?):', e);
        } finally {
          setOtaChecking(false);
        }
      }

      // 2. Fetch remote config (server URL, etc.)
      const remoteConfig = await loadRemoteConfig();
      setConfig(remoteConfig);
      setLoadingConfig(false);
    }

    startup();
  }, []);

  // ── Push notification + Hardware back button ────────────────────────────────
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        console.log('[Push] Registered:', token);
        setPushToken(token);
      }
    });

    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      });
      return () => backHandler.remove();
    }
  }, [canGoBack]);

  // ── WebView message bridge ──────────────────────────────────────────────────
  const handleWebViewMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'THEME_CHANGE') {
        setTheme(data.theme);
        setOverrideBg(data.bgColor || null);
      } else if (data.type === 'NATIVE_NOTIFICATION') {
        const Notifications = await import('expo-notifications');
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        await Notifications.scheduleNotificationAsync({
          content: {
            title: data.title || 'Notification',
            body: data.body || '',
            data: data.data || {},
          },
          trigger: null,
        });
      } else if (data.type === 'USER_LOGGED_IN' && pushToken && data.jwt) {
        // Register push token with backend
        try {
          const backendUrl = config?.backendUrl || 'https://api.timejournal.site';
          const res = await fetch(`${backendUrl}/api/push-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.jwt}`,
            },
            body: JSON.stringify({ token: pushToken }),
          });
          if (res.ok) console.log('[Push] Token registered with backend');
        } catch (err) {
          console.error('[Push] Failed to register token:', err);
        }
      }
    } catch (e) {
      console.error('[Bridge] Failed to parse WebView message:', e);
    }
  };

  // ── Injected JS: theme + navigation observer ────────────────────────────────
  const injectedJS = `
    (function() {
      function sendTheme() {
        const isDark = document.documentElement.classList.contains('dark');
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        const overrideColor = (metaTheme && metaTheme.content) ? metaTheme.content : null;
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'THEME_CHANGE', 
          theme: isDark ? 'dark' : 'light',
          bgColor: overrideColor
        }));
      }

      let tokenSent = false;
      function checkAndSendPushToken() {
        if (tokenSent) return;
        const jwt = localStorage.getItem('uj_token');
        if (jwt) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'USER_LOGGED_IN',
            jwt: jwt
          }));
          tokenSent = true;
        }
      }

      sendTheme();
      checkAndSendPushToken();

      // Hook into localStorage.setItem to catch login instantly
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        if (key === 'uj_token') {
          checkAndSendPushToken();
        }
      };

      // Also poll every 3 seconds just in case
      setInterval(checkAndSendPushToken, 3000);

      // Watch <html> class changes (dark/light toggle)
      const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') { sendTheme(); }
        });
      });
      themeObserver.observe(document.documentElement, { attributes: true });

      // Watch <head> for meta[name="theme-color"] add/remove/change
      const headObserver = new MutationObserver(() => { sendTheme(); });
      headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });

      // Intercept Next.js client-side navigation
      function patchHistory(type) {
        const orig = history[type];
        return function() {
          const result = orig.apply(this, arguments);
          setTimeout(sendTheme, 150);
          setTimeout(checkAndSendPushToken, 1000);
          return result;
        };
      }
      history.pushState = patchHistory('pushState');
      history.replaceState = patchHistory('replaceState');
      window.addEventListener('popstate', () => {
        setTimeout(sendTheme, 150);
        setTimeout(checkAndSendPushToken, 1000);
      });
    })();
    true;
  `;

  // ── Derived colors ──────────────────────────────────────────────────────────
  const defaultBgColor = theme === 'dark' ? '#0f1117' : '#f4f6f8';
  const bgColor = overrideBg || defaultBgColor;
  const statusBarStyle = (bgColor === '#2e2523' || theme === 'dark') ? 'light' : 'dark';

  // ── Loading / Maintenance screens ───────────────────────────────────────────
  if (loadingConfig || otaChecking) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.center, { backgroundColor: '#0f1117' }]}>
          <StatusBar style="light" backgroundColor="#0f1117" />
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>
            {otaChecking ? 'Updating app...' : 'Loading config...'}
          </Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (config?.maintenanceMode) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.center, { backgroundColor: '#0f1117' }]}>
          <StatusBar style="light" backgroundColor="#0f1117" />
          <Text style={styles.maintenanceTitle}>🛠️ Maintenance</Text>
          <Text style={styles.maintenanceText}>
            {config.maintenanceMessage || 'The app is currently under maintenance. Please try again later.'}
          </Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ── Main WebView ────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
        <StatusBar style={statusBarStyle} backgroundColor={bgColor} />
        <WebView
          ref={webViewRef}
          source={{ uri: config!.webAppUrl }}
          style={styles.webview}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          onMessage={handleWebViewMessage}
          injectedJavaScript={injectedJS}
          setSupportMultipleWindows={false}
          scalesPageToFit={true}
          cacheEnabled={true}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  maintenanceTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  maintenanceText: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 24,
  },
});
