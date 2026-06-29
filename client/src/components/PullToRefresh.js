import React, { useEffect, useRef, useState } from 'react';

/**
 * Lightweight pull-to-refresh for mobile web.
 *
 * Display/gesture only — when the user pulls DOWN from the very top of the page,
 * it shows a small spinner and calls onRefresh() (the page's existing data-reload
 * function). It only READS/reloads; it never changes data.
 *
 * Safe alongside the global `overscroll-behavior-y: none` lock — that disables the
 * browser's native pull-to-refresh, so this custom one won't fight it. It ignores
 * upward and horizontal gestures, so it won't interfere with normal vertical
 * scrolling or sideways table scrolling.
 */
const THRESHOLD = 70;   // px of pull needed to trigger a refresh
const MAX_PULL = 90;    // px the indicator can travel

const PullToRefresh = ({ onRefresh }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const startX = useRef(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const draggingRef = useRef(false);

  const setPullBoth = (v) => { pullRef.current = v; setPull(v); };

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e) => {
      if (refreshingRef.current || !atTop() || !e.touches || e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      draggingRef.current = false;
    };

    const onMove = (e) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;
      // Only react to a downward, mostly-vertical pull while at the top. Ignore
      // upward scrolls and horizontal swipes (so table side-scroll still works).
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !atTop()) {
        if (pullRef.current !== 0) setPullBoth(0);
        draggingRef.current = false;
        return;
      }
      draggingRef.current = true;
      if (e.cancelable) e.preventDefault();
      setPullBoth(Math.min(MAX_PULL, dy * 0.5));
    };

    const onEnd = async () => {
      if (startY.current == null) return;
      startY.current = null;
      const shouldRefresh = draggingRef.current && pullRef.current >= THRESHOLD;
      draggingRef.current = false;
      if (shouldRefresh && typeof onRefresh === 'function') {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullBoth(THRESHOLD);
        try {
          await onRefresh();
        } catch (_) {
          /* ignore — refresh errors are handled by the page itself */
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullBoth(0);
        }
      } else {
        setPullBoth(0);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);

  const visible = pull > 0 || refreshing;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2000,
        transform: `translateY(${refreshing ? THRESHOLD : pull}px)`,
        opacity: visible ? 1 : 0,
        transition: draggingRef.current ? 'none' : 'transform 0.2s ease, opacity 0.2s ease'
      }}
    >
      <div
        style={{
          marginTop: '0.5rem',
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#10b981',
          fontSize: '1.1rem'
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.15s ease',
            transform: refreshing
              ? 'none'
              : `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)`,
            animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none'
          }}
        >
          {refreshing ? '⟳' : '↓'}
        </span>
      </div>
      <style>{`@keyframes ptr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PullToRefresh;
