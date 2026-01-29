import React, { useState, useRef, useEffect } from 'react';
import './DatePicker.css';

const DatePicker = ({ label, name, value, onChange, min, required = false }) => {
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

  const isDisabled = (day) => {
    if (day.type !== 'current') return true;
    const date = new Date(year, month, day.day);
    date.setHours(0, 0, 0, 0);
    return date < minDate;
  };

  const isSelected = (day) => {
    if (day.type !== 'current' || !value) return false;
    const selected = new Date(value + 'T00:00:00');
    return (
      selected.getFullYear() === year &&
      selected.getMonth() === month &&
      selected.getDate() === day.day
    );
  };

  const isToday = (day) => {
    if (day.type !== 'current') return false;
    const now = new Date();
    return (
      now.getFullYear() === year &&
      now.getMonth() === month &&
      now.getDate() === day.day
    );
  };

  const handleSelect = (day) => {
    if (isDisabled(day)) return;
    const selected = new Date(year, month, day.day);
    const dateStr = selected.toISOString().split('T')[0];

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
                const todayStr = new Date().toISOString().split('T')[0];
                if (!min || todayStr >= min) {
                  onChange({ target: { name, value: todayStr } });
                  setOpen(false);
                }
              }}
              disabled={min && new Date().toISOString().split('T')[0] < min}
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
