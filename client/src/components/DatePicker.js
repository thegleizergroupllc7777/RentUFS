import React, { useState, useRef, useEffect } from 'react';
import './DatePicker.css';

// Convert a Date to YYYY-MM-DD in local timezone (avoids UTC shift from toISOString)
const toLocalDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// `bookedRanges` is optional and defaults to []. Each entry is
// { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } and grays out the days a vehicle is
// already reserved (start inclusive, end exclusive — the return day is free for a
// new pickup, matching the booking conflict guard on the server). When omitted,
// the picker behaves exactly as before, so every other usage is unaffected.
const DatePicker = ({ label, name, value, onChange, min, required = false, bookedRanges = [] }) => {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    if (min) return new Date(min + 'T00:00:00');
    return new Date();
  });
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minDate = min ? new Date(min + 'T00:00:00') : today;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Get days in the month grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days = [];

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: daysInPrevMonth - i, type: 'prev' });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, type: 'current' });
  }

  // Next month leading days
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, type: 'next' });
  }

  // Get the actual Date object for any day in the grid (prev, current, or next month)
  const getDateForDay = (day) => {
    if (day.type === 'prev') return new Date(year, month - 1, day.day);
    if (day.type === 'next') return new Date(year, month + 1, day.day);
    return new Date(year, month, day.day);
  };

  // True if this day falls inside an already-booked range (start inclusive,
  // end exclusive). Uses YYYY-MM-DD string compare, which is safe and tz-proof.
  const isBooked = (day) => {
    if (!bookedRanges || bookedRanges.length === 0) return false;
    const ds = toLocalDateStr(getDateForDay(day));
    return bookedRanges.some((r) => r && r.start && r.end && ds >= r.start && ds < r.end);
  };

  const isDisabled = (day) => {
    const date = getDateForDay(day);
    date.setHours(0, 0, 0, 0);
    return date < minDate || isBooked(day);
  };

  const isSelected = (day) => {
    if (!value) return false;
    const selected = new Date(value + 'T00:00:00');
    const date = getDateForDay(day);
    return (
      selected.getFullYear() === date.getFullYear() &&
      selected.getMonth() === date.getMonth() &&
      selected.getDate() === date.getDate()
    );
  };

  const isToday = (day) => {
    const now = new Date();
    const date = getDateForDay(day);
    return (
      now.getFullYear() === date.getFullYear() &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate()
    );
  };

  const handleSelect = (day) => {
    if (isDisabled(day)) return;
    const selected = getDateForDay(day);
    const dateStr = toLocalDateStr(selected);

    // Simulate an input change event
    onChange({ target: { name, value: dateStr } });
    setOpen(false);
  };

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const canGoPrev = () => {
    const prevLast = new Date(year, month, 0);
    return prevLast >= minDate;
  };

  const formatDisplay = (val) => {
    if (!val) return '';
    const d = new Date(val + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="datepicker-container" ref={containerRef}>
      {label && (
        <label className="form-label">
          {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}
      <div
        className={`datepicker-input ${open ? 'datepicker-input-active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className={value ? 'datepicker-value' : 'datepicker-placeholder'}>
          {value ? formatDisplay(value) : 'Select a date'}
        </span>
        <span className="datepicker-icon">📅</span>
      </div>

      {/* Hidden native input for form validation */}
      {required && (
        <input
          type="hidden"
          name={name}
          value={value || ''}
          required
        />
      )}

      {open && (
        <div className="datepicker-dropdown">
          <div className="datepicker-header">
            <button
              type="button"
              className="datepicker-nav"
              onClick={prevMonth}
              disabled={!canGoPrev()}
            >
              ‹
            </button>
            <span className="datepicker-month-year">
              {monthNames[month]} {year}
            </span>
            <button
              type="button"
              className="datepicker-nav"
              onClick={nextMonth}
            >
              ›
            </button>
          </div>

          <div className="datepicker-days-header">
            {dayNames.map(d => (
              <div key={d} className="datepicker-day-name">{d}</div>
            ))}
          </div>

          <div className="datepicker-days-grid">
            {days.map((day, idx) => (
              <button
                key={idx}
                type="button"
                className={[
                  'datepicker-day',
                  day.type !== 'current' ? 'datepicker-day-other' : '',
                  isDisabled(day) ? 'datepicker-day-disabled' : '',
                  isSelected(day) ? 'datepicker-day-selected' : '',
                  isToday(day) ? 'datepicker-day-today' : ''
                ].filter(Boolean).join(' ')}
                onClick={() => handleSelect(day)}
                disabled={isDisabled(day)}
              >
                {day.day}
              </button>
            ))}
          </div>

          <div className="datepicker-footer">
            <button
              type="button"
              className="datepicker-today-btn"
              onClick={() => {
                const todayStr = toLocalDateStr(new Date());
                if (!min || todayStr >= min) {
                  onChange({ target: { name, value: todayStr } });
                  setOpen(false);
                }
              }}
              disabled={min && toLocalDateStr(new Date()) < min}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
