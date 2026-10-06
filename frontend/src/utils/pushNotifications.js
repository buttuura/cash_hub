import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { API_URL } from '../lib/api';
import {
  requestNotificationPermission,
  SILENT_NOTIFICATION_CHANNEL_ID,
} from '../lib/notifications';
import { acknowledgeOrderNotification } from '../lib/notificationActions';

const localNotificationId = (eventId) => {
  let hash = 0;
  for (const character of String(eventId || Date.now())) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  }
  return hash || 1;
};

export async function initPushNotifications(userId) {
  if (!Capacitor.isNativePlatform() || !userId) return;

  const accessToken = localStorage.getItem('access_token');
  if (!accessToken) return;

  const listeners = [];
  try {
    listeners.push(await PushNotifications.addListener('registration', ({ value }) => {
      fetch(`${API_URL}/api/push/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: value }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`FCM token registration failed (${response.status})`);
        }
        localStorage.setItem('cashhub_fcm_token', value);
      }).catch((error) => {
        console.error('Unable to save FCM token:', error);
      });
    }));

    listeners.push(await PushNotifications.addListener('registrationError', (error) => {
      console.error('Firebase push registration failed:', error);
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      acknowledgeOrderNotification(notification.data);
    }));

    listeners.push(await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      acknowledgeOrderNotification(notification.extra);
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      LocalNotifications.schedule({
        notifications: [{
          id: localNotificationId(notification.data?.id),
          title: notification.title || 'Cash Hub',
          body: notification.body || 'You have a new notification',
          channelId: SILENT_NOTIFICATION_CHANNEL_ID,
          extra: notification.data,
        }],
      }).catch((error) => {
        console.error('Unable to display foreground push notification:', error);
      });
    }));

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      await Promise.all(listeners.map((listener) => listener.remove()));
      return;
    }

    await PushNotifications.register();
  } catch (error) {
    await Promise.all(listeners.map((listener) => listener.remove()));
    throw error;
  }

  return async () => Promise.all(listeners.map((listener) => listener.remove()));
}