import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');
const WS_URL = API_URL.replace(/^http/, 'ws');

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
};

const NotificationSound = () => {
  const { user, isAuthenticated } = useAuth();
  const audioRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const notificationSessionRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !user?.name) return;

    const registerPushNotifications = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      if (Notification.permission === 'denied') return;

      try {
        const permission = Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        const keyResponse = await fetch(`${API_URL}/api/push/vapid-public-key`);
        if (!keyResponse.ok) return;
        const { publicKey } = await keyResponse.json();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        await fetch(`${API_URL}/api/push/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch (error) {
        console.warn('Push notification registration failed:', error);
      }
    };

    registerPushNotifications();

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

    const connectWebSocket = () => {
      const wsUrl = `${WS_URL}/ws/orders/${encodeURIComponent((user.name || '').trim())}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Global WebSocket connected for order notifications');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'new_order') {
          notificationSessionRef.current += 1;
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.loop = true;
            audioRef.current.play().catch(() => {});
          }
          toast.info(`New order received from ${data.order.buyerName || 'a buyer'}`);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New order received', {
              body: `New order from ${data.order.buyerName || 'a buyer'}`,
              tag: `order-${data.order.id}`,
            });
          }
          window.dispatchEvent(new Event('new-order-received'));
        }
      };

      ws.onclose = () => {
        reconnectTimerRef.current = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('Global WebSocket error:', error);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      notificationSessionRef.current += 1;
      window.removeEventListener('stop-order-notification-sound', handleStopSound);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [user?.name, isAuthenticated]);

  if (!isAuthenticated) return null;

  return <audio ref={audioRef} src="/images/app_icons/cart_images/order_ring_tone.m4a" preload="auto" />;
};

export default NotificationSound;