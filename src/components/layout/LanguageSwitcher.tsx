import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED_LOCALES, LOCALE_LABELS, type SupportedLocale } from '@/lib/i18n';

/** Per-user language switcher (spec §5.7.5): instant apply, persists to storage. */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  return (
    <label className="flex items-center gap-2 text-sm">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <select
        aria-label="Language"
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
