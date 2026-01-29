/**
 * Convert 24-hour time string (e.g. "13:00") to 12-hour AM/PM format (e.g. "1:00 PM")
 */
export const formatTime = (time) => {
  if (!time) return '10:00 AM';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
};
