/**
 * Gregorian ↔ Ethiopian calendar conversion (blueprint §6, EthDatePicker).
 *
 * Storage is ALWAYS Gregorian; the Ethiopian calendar is a display concern.
 * Conversion goes through the Julian Day Number (JDN) so it is exact across
 * year boundaries, Meskerem 1 shifts, and Pagume 5/6 leap days.
 *
 * The Ethiopian year has 13 months: twelve of 30 days plus Pagume, which has
 * 5 days (6 in a leap year, when `year % 4 === 3`).
 */

export interface EthiopianDate {
  year: number;
  month: number; // 1..13 (13 = Pagume)
  day: number; // 1..30 (1..5 or 1..6 for Pagume)
}

export type Locale = 'en' | 'am' | 'om';

// Amete Mihret era epoch offset. Chosen so that 1 Meskerem 2000 EC maps to
// 12 September 2007 CE (the Ethiopian Millennium), verified in eth-calendar tests.
const JDN_EPOCH_OFFSET_AMETE_MIHRET = 1723856;

// ---------------------------------------------------------------------------
// JDN <-> Gregorian (proleptic Gregorian)
// ---------------------------------------------------------------------------

function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

// ---------------------------------------------------------------------------
// JDN <-> Ethiopian
// ---------------------------------------------------------------------------

function ethiopicToJDN(year: number, month: number, day: number): number {
  return (
    JDN_EPOCH_OFFSET_AMETE_MIHRET +
    365 * year +
    Math.floor(year / 4) +
    30 * month +
    day -
    31
  );
}

function jdnToEthiopic(jdn: number): EthiopianDate {
  const offset = jdn - JDN_EPOCH_OFFSET_AMETE_MIHRET;
  const r = ((offset % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year =
    4 * Math.floor(offset / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

// ---------------------------------------------------------------------------
// Public API (contract from blueprint §6)
// ---------------------------------------------------------------------------

export function gregorianToEthiopian(gDate: Date): EthiopianDate {
  const jdn = gregorianToJDN(
    gDate.getUTCFullYear(),
    gDate.getUTCMonth() + 1,
    gDate.getUTCDate(),
  );
  return jdnToEthiopic(jdn);
}

export function ethiopianToGregorian(eDate: EthiopianDate): Date {
  const jdn = ethiopicToJDN(eDate.year, eDate.month, eDate.day);
  const g = jdnToGregorian(jdn);
  return new Date(Date.UTC(g.year, g.month - 1, g.day));
}

/** True when the Ethiopian year is a leap year (Pagume has 6 days). */
export function isEthiopianLeapYear(year: number): boolean {
  return ((year % 4) + 4) % 4 === 3;
}

/** Number of days in an Ethiopian month (13 = Pagume: 5 or 6). */
export function ethiopianMonthLength(year: number, month: number): number {
  if (month === 13) return isEthiopianLeapYear(year) ? 6 : 5;
  return 30;
}

export const ETHIOPIAN_MONTHS: Record<Locale, string[]> = {
  en: [
    'Meskerem',
    'Tikimt',
    'Hidar',
    'Tahsas',
    'Tir',
    'Yekatit',
    'Megabit',
    'Miazia',
    'Ginbot',
    'Sene',
    'Hamle',
    'Nehase',
    'Pagume',
  ],
  am: [
    'መስከረም',
    'ጥቅምት',
    'ኅዳር',
    'ታኅሣሥ',
    'ጥር',
    'የካቲት',
    'መጋቢት',
    'ሚያዝያ',
    'ግንቦት',
    'ሰኔ',
    'ሐምሌ',
    'ነሐሴ',
    'ጳጉሜ',
  ],
  om: [
    'Fulbaana',
    'Onkololeessa',
    'Sadaasa',
    'Muddee',
    'Amajjii',
    'Guraandhala',
    'Bitooteessa',
    'Elba',
    'Caamsa',
    'Waxabajjii',
    'Adooleessa',
    'Hagayya',
    'Qaammee',
  ],
};

/** Format an Ethiopian date, e.g. `ጥቅምት 15, 2018`. */
export function formatEthiopian(eDate: EthiopianDate, locale: Locale = 'en'): string {
  const monthName = ETHIOPIAN_MONTHS[locale][eDate.month - 1] ?? '';
  return `${monthName} ${eDate.day}, ${eDate.year}`;
}

/** Convenience: format a stored Gregorian ISO string in the Ethiopian calendar. */
export function formatIsoAsEthiopian(iso: string, locale: Locale = 'en'): string {
  return formatEthiopian(gregorianToEthiopian(new Date(iso)), locale);
}
