import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { API_URL } from '../lib/api';
import {
  describeNotificationEvent,
  ORDER_NOTIFICATION_CHANNEL_ID,
  requestNotificationPermission,
  showNativeNotification,
  SILENT_NOTIFICATION_CHANNEL_ID,
} from '../lib/notifications';
import {
  getOrderSoundEnabled,
  ORDER_SOUND_SETTING_CHANGED,
  saveOrderSoundEnabled,
} from '../lib/notificationSettings';
import { acknowledgeOrderNotification } from '../lib/notificationActions';

const getWebSocketUrl = (channel) => {
  const url = new URL(API_URL || window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/orders/${encodeURIComponent((channel || '').trim())}`;
  url.search = '';
  return url.toString();
};

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
};

const NotificationSound = () => {
  const { user, isAuthenticated } = useAuth();
  const audioRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const seenNotificationsRef = useRef(new Map());
  const pollCursorRef = useRef(null);
  const pollingRef = useRef(false);
  const orderSoundEnabledRef = useRef(false);

  const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';

  // Treasurers and admins care about group-wide money movement, so they listen
  // to the shared channel as well as their own name.
  const isPrivileged = user?.role === 'treasurer' || user?.role === 'admin' || user?.role === 'super_admin';
  const channels = isPrivileged
    ? [user.name, '__group__']
    : [user?.name].filter(Boolean);
  const channelKey = channels.join('|');

  useEffect(() => {
    const userId = user?.id || user?._id;
    orderSoundEnabledRef.current = getOrderSoundEnabled(userId);

    const handleSettingChange = (event) => {
      if (event.detail?.userId !== userId) return;
      orderSoundEnabledRef.current = Boolean(event.detail.enabled);
      if (!event.detail.enabled) {
        window.dispatchEvent(new Event('stop-order-notification-sound'));
      }
    };
    window.addEventListener(ORDER_SOUND_SETTING_CHANGED, handleSettingChange);

    if (isAuthenticated && userId) {
      fetch(`${API_URL}/api/notification-settings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Could not load notification settings (${response.status})`);
        const settings = await response.json();
        saveOrderSoundEnabled(userId, Boolean(settings.order_sound_enabled));
      }).catch((error) => {
        console.warn('Unable to sync notification settings:', error);
      });
    }

    return () => window.removeEventListener(ORDER_SOUND_SETTING_CHANGED, handleSettingChange);
  }, [isAuthenticated, user?._id, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !channels.length) return;

    // Ask once the OS-level permission (required on Android 13+).
    if (isNative) {
      requestNotificationPermission();
    }

    const registerPushNotifications = async () => {
      if (isNative) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      if (Notification.permission === 'denied') return;

      try {
        const permission = Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        const keyResponse = await fetch(`${API_URL}/api/push/vapid-public-key`);
        if (!keyResponse.ok) {
          console.warn(`Push notification setup unavailable (HTTP ${keyResponse.status}).`);
          return;
        }
        const { publicKey } = await keyResponse.json();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        const subscribeResponse = await fetch(`${API_URL}/api/push/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!subscribeResponse.ok) {
          console.warn(`Push notification subscription failed (HTTP ${subscribeResponse.status}).`);
        }
      } catch (error) {
        console.warn('Push notification registration failed:', error);
      }
    };

    registerPushNotifications();

    const unlockAudio = () => {
      const audio = audioRef.current;
      if (!audio || audioUnlockedRef.current) return;

      audio.muted = true;
      const unlockAttempt = audio.play();
      if (unlockAttempt) {
        unlockAttempt.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audioUnlockedRef.current = true;
        }).catch(() => {
          audio.muted = false;
        });
      }
    };

    document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    const stopSound = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };

    const handleStopSound = () => {
      stopSound();
    };

    window.addEventListener('stop-order-notification-sound', handleStopSound);

    const openSockets = [];

    const handleMessage = (data, { fromServiceWorker = false } = {}) => {
      const described = describeNotificationEvent(data);
      if (!described) return;

      const now = Date.now();
      const seenNotifications = seenNotificationsRef.current;
      for (const [id, timestamp] of seenNotifications) {
        if (now - timestamp > 60000) seenNotifications.delete(id);
      }
      if (seenNotifications.has(described.id)) return;
      seenNotifications.set(described.id, now);

      const isOrder = data.type === 'new_order';
      const shouldPlaySound = isOrder && (
        data.sound_enabled === undefined
          ? orderSoundEnabledRef.current
          : data.sound_enabled === true || data.sound_enabled === 'true'
      );

      if (shouldPlaySound) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.loop = true;
          audioRef.current.play().catch((error) => {
            console.warn('Notification sound could not play:', error.name || error.message);
          });
        }
      }

      if (isOrder) {
        window.dispatchEvent(new Event('new-order-received'));
      }

      toast.info(described.body, isOrder ? {
        action: {
          label: 'Acknowledge',
          onClick: () => acknowledgeOrderNotification({ id: described.id, type: 'new_order' }),
        },
      } : undefined);

      if (isNative) {
        if (!localStorage.getItem('cashhub_fcm_token')) {
          showNativeNotification({
            ...described,
            type: data.type,
            channelId: shouldPlaySound ? ORDER_NOTIFICATION_CHANNEL_ID : SILENT_NOTIFICATION_CHANNEL_ID,
          });
        }
      } else if (!fromServiceWorker && 'Notification' in window && Notification.permission === 'granted') {
        const browserNotification = new Notification(described.title, {
          body: described.body,
          tag: described.id,
        });
        browserNotification.onclick = () => {
          window.focus();
          acknowledgeOrderNotification({ id: described.id, type: data.type });
          browserNotification.close();
        };
      }
    };

    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === 'CASHHUB_PUSH') {
        handleMessage(event.data.payload, { fromServiceWorker: true });
      } else if (event.data?.type === 'ACK_ORDER_NOTIFICATION') {
        acknowledgeOrderNotification({ id: event.data.eventId, type: 'new_order' });
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    const notificationId = new URLSearchParams(window.location.search).get('notificationId');
    if (notificationId) {
      acknowledgeOrderNotification({ id: notificationId, type: 'new_order' });
      const url = new URL(window.location.href);
      url.searchParams.delete('notificationId');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    pollCursorRef.current = new Date(Date.now() - 5000).toISOString();
    const pollNotifications = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      const requestStartedAt = Date.now();
      try {
        const response = await fetch(
          `${API_URL}/api/notifications?after=${encodeURIComponent(pollCursorRef.current)}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
        );
        if (!response.ok) {
          throw new Error(`Notification sync failed (${response.status})`);
        }
        const notifications = await response.json();
        notifications.forEach((notification) => handleMessage(notification));
        pollCursorRef.current = new Date(requestStartedAt - 1000).toISOString();
      } catch (error) {
        console.warn('Unable to sync notifications:', error);
      } finally {
        pollingRef.current = false;
      }
    };
    pollNotifications();
    const pollTimer = setInterval(pollNotifications, 5000);

    const connectChannel = (channel) => {
      const ws = new WebSocket(getWebSocketUrl(channel));
      openSockets.push(ws);

      ws.onopen = () => {
        console.log('WebSocket connected for channel', channel);
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          return;
        }
        handleMessage(data);
      };

      ws.onclose = () => {
        reconnectTimerRef.current = setTimeout(() => connectChannel(channel), 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };

    channels.forEach(connectChannel);

    return () => {
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('stop-order-notification-sound', handleStopSound);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
      clearInterval(pollTimer);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      openSockets.forEach((ws) => ws.close());
      openSockets.length = 0;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [channelKey, isAuthenticated]);

  if (!isAuthenticated) return null;

  return <audio ref={audioRef} src="/images/app_icons/cart_images/order_ring_tone.m4a" preload="auto" />;
};

export default NotificationSound;