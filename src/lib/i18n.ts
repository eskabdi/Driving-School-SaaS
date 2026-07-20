import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

/**
 * i18n setup (blueprint §6). Locales: en (default), am (Amharic), om (Afaan
 * Oromoo). Translations are split by namespace and lazy-loaded per namespace
 * so unused namespaces are never shipped. Detection order: explicit user choice
 * → tenant default → browser → en (tenant default is applied at runtime by the
 * auth/tenant context once known).
 */

export const SUPPORTED_LOCALES = ['en', 'am', 'om'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  am: 'አማርኛ',
  om: 'Afaan Oromoo',
};

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    ns: ['common'],
    defaultNS: 'common',
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'ds.locale',
      caches: ['localStorage'],
    },
  });

export default i18n;
