import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { API_URL } from '../lib/api';

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

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      LocalNotifications.schedule({
        notifications: [{
          id: Date.now() % 2147483647,
          title: notification.title || 'Cash Hub',
          body: notification.body || 'You have a new notification',
          extra: notification.data,
        }],
      }).catch((error) => {
        console.error('Unable to display foreground push notification:', error);
      });
    }));

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
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