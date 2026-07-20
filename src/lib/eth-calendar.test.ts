import { describe, it, expect } from 'vitest';
import {
  gregorianToEthiopian,
  ethiopianToGregorian,
  isEthiopianLeapYear,
  ethiopianMonthLength,
  formatEthiopian,
} from './eth-calendar';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('eth-calendar', () => {
  it('maps the Ethiopian Millennium (1 Meskerem 2000) to 12 Sep 2007', () => {
    expect(gregorianToEthiopian(utc(2007, 9, 12))).toEqual({ year: 2000, month: 1, day: 1 });
    expect(ethiopianToGregorian({ year: 2000, month: 1, day: 1 })).toEqual(utc(2007, 9, 12));
  });

  it('handles the New Year shift before a Gregorian leap year (2016 EC)', () => {
    // 2024 is a Gregorian leap year, so Ethiopian New Year 2016 is 12 Sep 2023,
    // and 11 Sep 2023 is the last day (Pagume 6) of the leap year 2015 EC.
    expect(gregorianToEthiopian(utc(2023, 9, 12))).toEqual({ year: 2016, month: 1, day: 1 });
    expect(gregorianToEthiopian(utc(2023, 9, 11))).toEqual({ year: 2015, month: 13, day: 6 });
  });

  it('round-trips arbitrary dates', () => {
    for (const g of [utc(1990, 1, 1), utc(2024, 2, 29), utc(2026, 7, 19), utc(2018, 12, 31)]) {
      const back = ethiopianToGregorian(gregorianToEthiopian(g));
      expect(back.getTime()).toBe(g.getTime());
    }
  });

  it('handles Pagume 5 (common) and Pagume 6 (leap)', () => {
    // 2003 EC is a leap year (2003 % 4 === 3): Pagume has 6 days.
    expect(isEthiopianLeapYear(2003)).toBe(true);
    expect(ethiopianMonthLength(2003, 13)).toBe(6);
    expect(gregorianToEthiopian(utc(2011, 9, 11))).toEqual({ year: 2003, month: 13, day: 6 });

    // 2004 EC is common: Pagume has 5 days.
    expect(isEthiopianLeapYear(2004)).toBe(false);
    expect(ethiopianMonthLength(2004, 13)).toBe(5);
  });

  it('formats with localized month names', () => {
    expect(formatEthiopian({ year: 2018, month: 2, day: 15 }, 'en')).toBe('Tikimt 15, 2018');
    expect(formatEthiopian({ year: 2018, month: 2, day: 15 }, 'am')).toBe('ጥቅምት 15, 2018');
  });
});
