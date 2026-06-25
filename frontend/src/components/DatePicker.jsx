import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './DatePicker.css';

export default function DatePicker({ 
  value, 
  onChange, 
  placeholder = 'Select Date',
  minYear,
  maxYear
}) {
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
  
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Synchronize inputValue with prop value based on focus state
  useEffect(() => {
    if (isFocused) {
      setInputValue(value || '');
    } else {
      setInputValue(formatDateString(value));
    }
  }, [value, isFocused]);

  // Sync viewDate if outer value changes
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

  // Calculate coordinates for portal dropdown
  const updateCoords = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  // Listeners for outside click and coords update
  useEffect(() => {
    function handleClickOutside(event) {
      const dropdownEl = document.getElementById('datepicker-portal-dropdown');
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target) &&
        (!dropdownEl || !dropdownEl.contains(event.target))
      ) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, []);

  // Update coords when calendar opens
  useEffect(() => {
    if (isOpen) {
      updateCoords();
    }
  }, [isOpen]);

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
    const selectedDate = new Date(year, month, dayNum);
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleSelectPrevMonthDay = (dayNum) => {
    const targetMonth = month === 0 ? 11 : month - 1;
    const targetYear = month === 0 ? year - 1 : year;
    const selectedDate = new Date(targetYear, targetMonth, dayNum);
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    setViewDate(new Date(targetYear, targetMonth, 1));
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleSelectNextMonthDay = (dayNum) => {
    const targetMonth = month === 11 ? 0 : month + 1;
    const targetYear = month === 11 ? year + 1 : year;
    const selectedDate = new Date(targetYear, targetMonth, dayNum);
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    setViewDate(new Date(targetYear, targetMonth, 1));
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

  // Next month days to fill grid
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

  // Year Selection Limits
  const currentYear = new Date().getFullYear();
  const startYear = minYear !== undefined ? minYear : currentYear - 30;
  const endYear = maxYear !== undefined ? maxYear : currentYear + 5;
  const years = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }

  // Format date for text display
  function formatDateString(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const yVal = parseInt(parts[0], 10);
      const mVal = parseInt(parts[1], 10) - 1;
      const dVal = parseInt(parts[2], 10);
      const d = new Date(yVal, mVal, dVal);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
    }
    return '';
  }

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    // Validate standard YYYY-MM-DD format on keystroke
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const d = parseInt(match[3], 10);
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime()) && y >= startYear && y <= endYear) {
        onChange(val);
      }
    }
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    // On blur, parse inputValue. If it's a valid date string (e.g. MM/DD/YYYY or similar), convert to YYYY-MM-DD
    const d = new Date(inputValue);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      if (yyyy >= startYear && yyyy <= endYear) {
        onChange(`${yyyy}-${mm}-${dd}`);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  const handleDayKeyDown = (e, dayNum, type) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (type === 'prev') {
        handleSelectPrevMonthDay(dayNum);
      } else if (type === 'next') {
        handleSelectNextMonthDay(dayNum);
      } else {
        handleSelectDay(dayNum);
      }
    }
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
      <div className="datepicker-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="filter-input datepicker-display-input"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
        />
        <CalendarIcon />
        {value && <ClearIcon />}
      </div>

      {isOpen && createPortal(
        <div 
          id="datepicker-portal-dropdown"
          className="datepicker-dropdown"
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            minWidth: '280px',
            transform: 'none',
            zIndex: 9999
          }}
        >
          <div className="datepicker-header">
            <button 
              type="button" 
              className="datepicker-nav-btn" 
              onClick={handlePrevMonth}
              tabIndex={0}
            >
              &lt;
            </button>
            <div className="datepicker-title">
              <span className="month-label">{monthNames[month]}</span>
              <select 
                className="year-select" 
                value={year} 
                onChange={handleYearChange} 
                onClick={(e) => e.stopPropagation()}
                tabIndex={0}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button 
              type="button" 
              className="datepicker-nav-btn" 
              onClick={handleNextMonth}
              tabIndex={0}
            >
              &gt;
            </button>
          </div>

          <div className="datepicker-weekdays">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
          </div>

          <div className="datepicker-days">
            {prevMonthPadding.map((d, i) => (
              <span 
                key={`prev-${i}`} 
                className="datepicker-day sibling-month"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPrevMonthDay(d);
                }}
                onKeyDown={(e) => handleDayKeyDown(e, d, 'prev')}
                tabIndex={0}
              >
                {d}
              </span>
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
                  onKeyDown={(e) => handleDayKeyDown(e, d, 'curr')}
                  tabIndex={0}
                >
                  {d}
                </span>
              );
            })}
            {nextMonthPadding.map((d, i) => (
              <span 
                key={`next-${i}`} 
                className="datepicker-day sibling-month"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectNextMonthDay(d);
                }}
                onKeyDown={(e) => handleDayKeyDown(e, d, 'next')}
                tabIndex={0}
              >
                {d}
              </span>
            ))}
          </div>
        </div>,
        document.body
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
