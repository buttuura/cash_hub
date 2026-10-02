import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { runRefresh } from '../lib/refreshBus';

const TRIGGER_DISTANCE = 72;
const MAX_PULL_DISTANCE = 120;
const INDICATOR_SIZE = 36;

const isAtScrollTop = () => {
  if (window.scrollY > 0) return false;
  const root = document.scrollingElement || document.documentElement;
  return root.scrollTop <= 0;
};

const PullToRefresh = ({ children, enabled = true }) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(null);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const distanceRef = useRef(0);

  const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';
  const active = isNative && enabled && !isRefreshing;

  const reset = useCallback(() => {
    startYRef.current = null;
    pullingRef.current = false;
    distanceRef.current = 0;
    setPullDistance(0);
  }, []);

  const triggerRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await runRefresh();
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
      reset();
    }
  }, [reset]);

  useEffect(() => {
    if (!active) {
      reset();
      return undefined;
    }

    const onTouchStart = (event) => {
      if (refreshingRef.current) return;
      const touch = event.touches[0];
      if (!touch || !isAtScrollTop()) return;
      startYRef.current = touch.clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (event) => {
      if (!pullingRef.current || refreshingRef.current || startYRef.current === null) return;
      const touch = event.touches[0];
      if (!touch) return;

      const delta = touch.clientY - startYRef.current;
      if (delta <= 0 || !isAtScrollTop()) {
        reset();
        return;
      }

      if (event.cancelable) event.preventDefault();

      const distance = Math.min(delta * 0.5, MAX_PULL_DISTANCE);
      distanceRef.current = distance;
      setPullDistance(distance);
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      const shouldRefresh = distanceRef.current >= TRIGGER_DISTANCE;
      if (shouldRefresh) {
        triggerRefresh();
        return;
      }
      reset();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [active, reset, triggerRefresh]);

  const progress = Math.min(pullDistance / TRIGGER_DISTANCE, 1);
  const indicatorTop = isRefreshing ? INDICATOR_SIZE : Math.max(pullDistance - INDICATOR_SIZE, 0);
  const visible = isRefreshing || pullDistance > 0;

  return (
    <>
      {visible && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            left: '50%',
            marginLeft: -INDICATOR_SIZE / 2,
            width: INDICATOR_SIZE,
            height: INDICATOR_SIZE,
            transform: `translateY(${indicatorTop}px)`,
            opacity: isRefreshing ? 1 : progress,
            pointerEvents: 'none',
            zIndex: 10000,
            transition: isRefreshing ? 'opacity 120ms ease-out' : 'transform 160ms ease-out, opacity 160ms ease-out',
          }}
        >
          <svg
            viewBox="0 0 40 40"
            width={INDICATOR_SIZE}
            height={INDICATOR_SIZE}
            style={{
              transform: `rotate(${isRefreshing ? 'none' : progress * 270}deg)`,
              animation: isRefreshing ? 'cashhub-pull-spin 800ms linear infinite' : 'none',
            }}
          >
            <circle cx="20" cy="20" r="15" fill="none" stroke="#E8EBE8" strokeWidth="4" />
            <circle
              cx="20"
              cy="20"
              r="15"
              fill="none"
              stroke="#2C5530"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${progress * 94.2} 94.2`}
              transform="rotate(-90 20 20)"
            />
          </svg>
        </div>
      )}
      {children}
    </>
  );
};

export default PullToRefresh;