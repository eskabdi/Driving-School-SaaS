import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  gregorianToEthiopian,
  ethiopianToGregorian,
  ethiopianMonthLength,
  formatEthiopian,
  ETHIOPIAN_MONTHS,
  type EthiopianDate,
  type Locale,
} from '@/lib/eth-calendar';

/**
 * EthDatePicker (blueprint §6). Contract:
 * - value is a Gregorian ISO date string `YYYY-MM-DD` (storage format).
 * - onChange emits the Gregorian ISO string.
 * - displayCalendar decides which grid is rendered.
 * - The converse calendar's date is always shown as helper text (spec §5.7.4).
 */

export interface EthDatePickerProps {
  value?: string; // Gregorian YYYY-MM-DD
  onChange: (isoDate: string) => void;
  displayCalendar?: 'ethiopian' | 'gregorian';
  locale?: Locale;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIso(iso: string | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

const GREG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function EthDatePicker({
  value,
  onChange,
  displayCalendar = 'ethiopian',
  locale = 'en',
  disabled,
  className,
  id,
}: EthDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);

  // The month currently shown in the grid (defaults to selected or today).
  const [cursor, setCursor] = useState<EthiopianDate>(() =>
    gregorianToEthiopian(selected ?? new Date()),
  );

  const label = useMemo(() => {
    if (!selected) return '';
    if (displayCalendar === 'ethiopian') {
      return formatEthiopian(gregorianToEthiopian(selected), locale);
    }
    return `${GREG_MONTHS[selected.getUTCMonth()]} ${selected.getUTCDate()}, ${selected.getUTCFullYear()}`;
  }, [selected, displayCalendar, locale]);

  const converse = useMemo(() => {
    if (!selected) return '';
    if (displayCalendar === 'ethiopian') {
      return `= ${GREG_MONTHS[selected.getUTCMonth()]} ${selected.getUTCDate()}, ${selected.getUTCFullYear()} G.C.`;
    }
    return `= ${formatEthiopian(gregorianToEthiopian(selected), locale)} E.C.`;
  }, [selected, displayCalendar, locale]);

  const grid = useMemo(
    () => buildGrid(cursor, displayCalendar),
    [cursor, displayCalendar],
  );

  function move(delta: number) {
    if (displayCalendar === 'ethiopian') {
      let m = cursor.month + delta;
      let y = cursor.year;
      if (m < 1) {
        m = 13;
        y -= 1;
      } else if (m > 13) {
        m = 1;
        y += 1;
      }
      setCursor({ year: y, month: m, day: 1 });
    } else {
      const g = ethiopianToGregorian({ ...cursor, day: 1 });
      g.setUTCMonth(g.getUTCMonth() + delta);
      setCursor(gregorianToEthiopian(g));
    }
  }

  function pick(d: Date) {
    onChange(toIso(d));
    setOpen(false);
  }

  // Month-by-month navigation alone makes distant dates (a learner's date of
  // birth, an instructor's hire date) hundreds of clicks away. These let the
  // header jump straight to a month/year instead.
  const displayGregorian = ethiopianToGregorian({ ...cursor, day: 1 });
  const monthOptions = displayCalendar === 'ethiopian' ? ETHIOPIAN_MONTHS[locale] : GREG_MONTHS;
  const monthValue = displayCalendar === 'ethiopian' ? cursor.month - 1 : displayGregorian.getUTCMonth();
  const yearValue = displayCalendar === 'ethiopian' ? cursor.year : displayGregorian.getUTCFullYear();

  const yearOptions = useMemo(() => {
    const anchor =
      displayCalendar === 'ethiopian'
        ? gregorianToEthiopian(new Date()).year
        : new Date().getUTCFullYear();
    const years: number[] = [];
    for (let y = anchor + 10; y >= anchor - 100; y--) years.push(y);
    return years;
  }, [displayCalendar]);

  function handleMonthSelect(monthIndex: number) {
    if (displayCalendar === 'ethiopian') {
      setCursor({ year: cursor.year, month: monthIndex + 1, day: 1 });
    } else {
      const g = new Date(Date.UTC(displayGregorian.getUTCFullYear(), monthIndex, 1));
      setCursor(gregorianToEthiopian(g));
    }
  }

  function handleYearSelect(year: number) {
    if (displayCalendar === 'ethiopian') {
      setCursor({ year, month: cursor.month, day: 1 });
    } else {
      const g = new Date(Date.UTC(year, displayGregorian.getUTCMonth(), 1));
      setCursor(gregorianToEthiopian(g));
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn(!label && 'text-muted-foreground')}>{label || 'Select a date'}</span>
        <CalendarDays className="h-4 w-4 opacity-60" />
      </button>

      {converse && <p className="mt-1 text-xs text-muted-foreground">{converse}</p>}

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
          <div className="mb-2 flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <select
              aria-label="Month"
              value={monthValue}
              onChange={(e) => handleMonthSelect(Number(e.target.value))}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs"
            >
              {monthOptions.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={yearValue}
              onChange={(e) => handleYearSelect(Number(e.target.value))}
              className="h-8 w-[4.5rem] rounded-md border border-input bg-background px-1 text-xs"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="icon" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const isSelected = selected && toIso(cell.date) === toIso(selected);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(cell.date)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md text-sm hover:bg-accent',
                    isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface GridCell {
  day: number;
  date: Date;
}

/**
 * Build a 7-column month grid. For the Ethiopian calendar each month is 30 days
 * (Pagume 5/6); leading blanks align the first day to its weekday.
 */
function buildGrid(
  cursor: EthiopianDate,
  displayCalendar: 'ethiopian' | 'gregorian',
): (GridCell | null)[] {
  const cells: (GridCell | null)[] = [];

  if (displayCalendar === 'ethiopian') {
    const len = ethiopianMonthLength(cursor.year, cursor.month);
    const first = ethiopianToGregorian({ year: cursor.year, month: cursor.month, day: 1 });
    const leading = first.getUTCDay();
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let day = 1; day <= len; day++) {
      cells.push({
        day,
        date: ethiopianToGregorian({ year: cursor.year, month: cursor.month, day }),
      });
    }
  } else {
    const g = ethiopianToGregorian({ ...cursor, day: 1 });
    const year = g.getUTCFullYear();
    const month = g.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const leading = first.getUTCDay();
    const len = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let day = 1; day <= len; day++) {
      cells.push({ day, date: new Date(Date.UTC(year, month, day)) });
    }
  }

  return cells;
}
