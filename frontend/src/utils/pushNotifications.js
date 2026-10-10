import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { API_URL } from '../lib/api';
import {
  getLocalNotificationId,
  requestNotificationPermission,
  ORDER_NOTIFICATION_CHANNEL_ID,
  ORDER_NOTIFICATION_ACTION_TYPE_ID,
  ORDER_RECEIVED_ACTION_ID,
  SILENT_NOTIFICATION_CHANNEL_ID,
} from '../lib/notifications';
import { acknowledgeOrderNotification } from '../lib/notificationActions';
import { getOrderSoundEnabled } from '../lib/notificationSettings';

export async function initPushNotifications(userId) {
  if (!Capacitor.isNativePlatform() || !userId) return;

  const accessToken = localStorage.getItem('access_token');
  if (!accessToken) return;

  const listeners = [];
  const removeListeners = async () => {
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
  };

  try {
    listeners.push(await PushNotifications.addListener('registration', ({ value }) => {
      if (!value) return;
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
      window.dispatchEvent(new CustomEvent('cashhub-native-notification-opened', {
        detail: notification.data,
      }));
    }));

    listeners.push(await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      if (notification.actionId === ORDER_RECEIVED_ACTION_ID) {
        acknowledgeOrderNotification(notification.extra);
      } else {
        window.dispatchEvent(new CustomEvent('cashhub-native-notification-opened', {
          detail: notification.extra,
        }));
      }
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification?.data || {};
      const soundEnabled = data.sound_enabled === undefined
        ? getOrderSoundEnabled(userId)
        : data.sound_enabled === true || data.sound_enabled === 'true';
      const channelId = data.type === 'new_order' && soundEnabled
        ? ORDER_NOTIFICATION_CHANNEL_ID
        : SILENT_NOTIFICATION_CHANNEL_ID;

      requestNotificationPermission().then((permission) => {
        if (permission !== 'granted') return;
        const notificationId = getLocalNotificationId(data.id || notification?.id || Date.now());
        return LocalNotifications.schedule({
          notifications: [{
            id: notificationId,
            title: notification?.title || data.title || 'Cash Hub',
            body: notification?.body || data.body || 'You have a new notification',
            channelId,
            smallIcon: 'ic_stat_notification',
            ...(data.type === 'new_order'
              ? { actionTypeId: ORDER_NOTIFICATION_ACTION_TYPE_ID }
              : {}),
            ...(channelId === ORDER_NOTIFICATION_CHANNEL_ID
              ? { sound: 'order_ring_tone.m4a' }
              : {}),
            extra: { ...data, notificationId },
          }],
        });
      }).catch((error) => {
        console.error('Unable to display foreground push notification:', error);
      });
    }));

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      await removeListeners();
      return;
    }

    await PushNotifications.register();
  } catch (error) {
    await removeListeners();
    throw error;
  }

  return removeListeners;
}