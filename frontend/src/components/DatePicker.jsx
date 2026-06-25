import { useState, useRef, useEffect } from 'react';
import './DatePicker.css';

export default function DatePicker({ value, onChange, placeholder = 'Select Date' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(d.getTime())) return d;
      }
    }
    return new Date();
  });
  const containerRef = useRef(null);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync view date if input value changes
  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(d.getTime())) {
          setViewDate(d);
        }
      }
    }
  }, [value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleYearChange = (e) => {
    setViewDate(new Date(parseInt(e.target.value, 10), month, 1));
  };

  const handleSelectDay = (dayNum) => {
    // Format to YYYY-MM-DD in local time zone
    const selectedDate = new Date(year, month, dayNum);
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  // Generate days grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  // Previous month days to fill start
  const prevMonthDays = month === 0 ? getDaysInMonth(year - 1, 11) : getDaysInMonth(year, month - 1);
  const prevMonthPadding = [];
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    prevMonthPadding.push(prevMonthDays - i);
  }

  // Current month days
  const currentMonthDays = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentMonthDays.push(i);
  }

  // Next month days to fill grid (assuming 42 cells grid: 6 rows * 7 days)
  const totalCells = 42;
  const nextMonthPaddingCount = totalCells - (prevMonthPadding.length + currentMonthDays.length);
  const nextMonthPadding = [];
  for (let i = 1; i <= nextMonthPaddingCount; i++) {
    nextMonthPadding.push(i);
  }

  // Selected date details
  let selectedYear, selectedMonth, selectedDay;
  if (value) {
    const parts = value.split('-');
    if (parts.length === 3) {
      selectedYear = parseInt(parts[0], 10);
      selectedMonth = parseInt(parts[1], 10) - 1;
      selectedDay = parseInt(parts[2], 10);
    }
  }

  // Generate list of years for selection dropdown (from 20 years ago to 2 years in future)
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 20; y <= currentYear + 2; y++) {
    years.push(y);
  }

  // Timezone-safe date string formatter for input display
  const formatDateString = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const yVal = parseInt(parts[0], 10);
      const mVal = parseInt(parts[1], 10) - 1;
      const dVal = parseInt(parts[2], 10);
      return new Date(yVal, mVal, dVal).toLocaleDateString();
    }
    return '';
  };

  // SVG Icons
  const CalendarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="input-calendar-icon">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  const ClearIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="clear-date-icon" onClick={handleClear} title="Clear date filter">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  return (
    <div className="custom-datepicker-container" ref={containerRef}>
      <div className="datepicker-input-wrapper" onClick={() => setIsOpen(!isOpen)}>
        <input
          type="text"
          className="filter-input datepicker-display-input"
          placeholder={placeholder}
          value={formatDateString(value)}
          readOnly
        />
        <CalendarIcon />
        {value && <ClearIcon />}
      </div>

      {isOpen && (
        <div className="datepicker-dropdown">
          <div className="datepicker-header">
            <button type="button" className="datepicker-nav-btn" onClick={handlePrevMonth}>
              &lt;
            </button>
            <div className="datepicker-title">
              <span className="month-label">{monthNames[month]}</span>
              <select className="year-select" value={year} onChange={handleYearChange} onClick={(e) => e.stopPropagation()}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button type="button" className="datepicker-nav-btn" onClick={handleNextMonth}>
              &gt;
            </button>
          </div>

          <div className="datepicker-weekdays">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
          </div>

          <div className="datepicker-days">
            {prevMonthPadding.map((d, i) => (
              <span key={`prev-${i}`} className="datepicker-day sibling-month">{d}</span>
            ))}
            {currentMonthDays.map((d) => {
              const isSelected = selectedYear === year && selectedMonth === month && selectedDay === d;
              const isToday = new Date().getFullYear() === year && new Date().getMonth() === month && new Date().getDate() === d;
              return (
                <span
                  key={`curr-${d}`}
                  className={`datepicker-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectDay(d);
                  }}
                >
                  {d}
                </span>
              );
            })}
            {nextMonthPadding.map((d, i) => (
              <span key={`next-${i}`} className="datepicker-day sibling-month">{d}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}
