import React from 'react';

// Admin-only "last active" indicator. Purely cosmetic — it shows when a user
// was last seen on the site (from the lightweight heartbeat). It is NEVER shown
// to customers, and nothing here touches booking, payment, insurance, or tolls.
export function formatLastActive(input) {
  if (!input) return { text: 'No activity yet', color: '#9ca3af' };
  const then = new Date(input).getTime();
  if (isNaN(then)) return { text: 'No activity yet', color: '#9ca3af' };
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 2) return { text: 'Active now', color: '#10b981' };
  if (mins < 5) return { text: `Active ${mins} min ago`, color: '#10b981' };
  if (mins < 30) return { text: `Active ${mins} min ago`, color: '#d97706' };
  if (mins < 60) return { text: `Last seen ${mins} min ago`, color: '#9ca3af' };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: `Last seen ${hrs} hr${hrs === 1 ? '' : 's'} ago`, color: '#9ca3af' };
  const days = Math.floor(hrs / 24);
  return { text: `Last seen ${days} day${days === 1 ? '' : 's'} ago`, color: '#9ca3af' };
}

const LastActiveBadge = ({ date, style, compact }) => {
  const { text, color } = formatLastActive(date);
  // Compact: just the small dot, with the exact time shown on hover — keeps the
  // Users list uncluttered. (Used in the big table.)
  if (compact) {
    return (
      <span
        title={text}
        aria-label={text}
        style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block', flex: 'none', ...style }}
      />
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color, ...style }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block', flex: 'none' }} />
      {text}
    </span>
  );
};

export default LastActiveBadge;
