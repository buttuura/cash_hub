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

  useEffect(() => {
    if (!isAuthenticated || !user?.name) return;

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
          if (audioRef.current) {
            audioRef.current.loop = true;
            audioRef.current.play().catch(() => {});
          }
          toast.info(`New order received from ${data.order.buyerName || 'a buyer'}`);
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
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.name, isAuthenticated]);

  if (!isAuthenticated) return null;

  return <audio ref={audioRef} src="/images/app_icons/cart_images/order_ring_tone.m4a" preload="auto" />;
};

export default NotificationSound;