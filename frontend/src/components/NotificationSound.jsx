import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace(/^http/, 'ws');

const NotificationSound = () => {
  const { user, isAuthenticated } = useAuth();
  const audioRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const notificationSessionRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !user?.name) return;

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
          const currentSession = ++notificationSessionRef.current;
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.pause();
            audioRef.current.loop = false;
            audioRef.current.play().catch(() => {});
          }
          setTimeout(() => {
            if (currentSession === notificationSessionRef.current && audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
          }, 2500);
          toast.info(`New order received from ${data.order.buyerName || 'a buyer'}`);
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