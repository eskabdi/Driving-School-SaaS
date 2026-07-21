/**
 * Ethiopian driver's license categories — Proclamation No. 1074/2018 Schedule.
 * Mirrors the `license_categories` seed. `code` is the licensable unit; names
 * are resolved from i18n where a localized label is needed.
 */
export interface LicenseCategoryDef {
  code: string;
  categoryNo: number;
  level?: string;
  nameEn: string;
}

export const LICENSE_CATEGORIES: LicenseCategoryDef[] = [
  { code: '1', categoryNo: 1, nameEn: 'Motorcycle' },
  { code: '2', categoryNo: 2, nameEn: 'Three-Wheel Motorcycle' },
  { code: '3', categoryNo: 3, nameEn: 'Automobile' },
  { code: '4-1', categoryNo: 4, level: 'I', nameEn: 'Public Transport — Level I' },
  { code: '4-2', categoryNo: 4, level: 'II', nameEn: 'Public Transport — Level II' },
  { code: '4-3', categoryNo: 4, level: 'III', nameEn: 'Public Transport — Level III' },
  { code: '5-1', categoryNo: 5, level: 'I', nameEn: 'Truck — Level I' },
  { code: '5-2', categoryNo: 5, level: 'II', nameEn: 'Truck — Level II' },
  { code: '5-3', categoryNo: 5, level: 'III', nameEn: 'Truck — Level III' },
  { code: '6-1', categoryNo: 6, level: 'I', nameEn: 'Fuel Tanker — Level I' },
  { code: '6-2', categoryNo: 6, level: 'II', nameEn: 'Fuel Tanker — Level II' },
  { code: '7', categoryNo: 7, nameEn: 'Machinery Operator' },
];
