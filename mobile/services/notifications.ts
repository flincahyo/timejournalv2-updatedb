import { Platform } from 'react-native';

/**
 * Registers for Expo push notifications.
 * Silently skips when running in Expo Go (SDK 53+), as remote push
 * notifications are no longer supported there. Works in development builds and APKs.
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    try {
        // Dynamically import to prevent module crash in Expo Go
        const Constants = (await import('expo-constants')).default;
        const Device = await import('expo-device');

        // Detect Expo Go: executionEnvironment is 'storeClient' in Expo Go
        const isExpoGo = Constants.executionEnvironment === 'storeClient';
        if (isExpoGo) {
            console.log('[Notifications] Expo Go detected — push notifications require a development build (APK). Skipping.');
            return undefined;
        }

        const Notifications = await import('expo-notifications');

        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (!Device.isDevice) {
            console.log('[Notifications] Must use physical device for Push Notifications.');
            return undefined;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[Notifications] Permission not granted.');
            return undefined;
        }

        const token = (await Notifications.getExpoPushTokenAsync()).data;
        console.log('[Notifications] Expo Push Token:', token);
        return token;

    } catch (error) {
        console.log('[Notifications] Push notification registration skipped:', error);
        return undefined;
    }
}
