import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL = 'arrival';

// show the alert even while the app is open (the Watch screen is open when it fires)
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Creates the Android channel (needed before the permission prompt on Android 13+) and asks for permission. */
export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Arrival alerts', importance: Notifications.AndroidImportance.HIGH });
    }
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notifyArrival(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: 'default' }, trigger: { channelId: CHANNEL } });
  } catch { }
}
