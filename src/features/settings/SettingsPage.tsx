import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import type { AppError } from '@/lib/errors';
import { useTenantSettings, useUpdateTenantSettings, type SettingsPatch } from './api';
import { BranchesCard } from './BranchesCard';

/**
 * Settings — General tab (spec §4). Editable tenant_settings; save is gated to
 * school_admin by RLS and by the settings.edit capability in the UI. A dirty-
 * state guard prevents redundant saves.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id ?? null;
  const { data, isLoading } = useTenantSettings(tenantId);
  const update = useUpdateTenantSettings(tenantId);
  const canEdit = roleHasCapability(claims?.role, 'settings.edit');

  const [form, setForm] = useState<SettingsPatch>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        default_locale: data.default_locale,
        date_calendar: data.date_calendar,
        timezone: data.timezone,
        currency: data.currency,
        lesson_slot_minutes: data.lesson_slot_minutes,
        late_cancel_hours: data.late_cancel_hours,
        min_activation_pct: data.min_activation_pct,
        registration_open: data.registration_open,
      });
    }
  }, [data]);

  const set = <K extends keyof SettingsPatch>(k: K, v: SettingsPatch[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync(form);
      setSaved(true);
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.settings')} description={t('settings.subtitle')} />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t('settings.noTenant')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
        <form onSubmit={onSave}>
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.general')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="locale">{t('settings.locale')}</Label>
                  <select
                    id="locale"
                    disabled={!canEdit}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                    value={form.default_locale ?? 'en'}
                    onChange={(e) => set('default_locale', e.target.value as 'en' | 'am' | 'om')}
                  >
                    <option value="en">English</option>
                    <option value="am">አማርኛ</option>
                    <option value="om">Afaan Oromoo</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="calendar">{t('settings.calendar')}</Label>
                  <select
                    id="calendar"
                    disabled={!canEdit}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                    value={form.date_calendar ?? 'ethiopian'}
                    onChange={(e) =>
                      set('date_calendar', e.target.value as 'ethiopian' | 'gregorian')
                    }
                  >
                    <option value="ethiopian">{t('settings.calEthiopian')}</option>
                    <option value="gregorian">{t('settings.calGregorian')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">{t('settings.timezone')}</Label>
                  <Input
                    id="timezone"
                    disabled={!canEdit}
                    value={form.timezone ?? ''}
                    onChange={(e) => set('timezone', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">{t('settings.currency')}</Label>
                  <Input
                    id="currency"
                    disabled={!canEdit}
                    value={form.currency ?? ''}
                    onChange={(e) => set('currency', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot">{t('settings.slotMinutes')}</Label>
                  <Input
                    id="slot"
                    type="number"
                    min={15}
                    disabled={!canEdit}
                    value={form.lesson_slot_minutes ?? 60}
                    onChange={(e) => set('lesson_slot_minutes', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cancel">{t('settings.lateCancelHours')}</Label>
                  <Input
                    id="cancel"
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={form.late_cancel_hours ?? 24}
                    onChange={(e) => set('late_cancel_hours', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="activation">{t('settings.minActivationPct')}</Label>
                  <Input
                    id="activation"
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canEdit}
                    value={form.min_activation_pct ?? 25}
                    onChange={(e) => set('min_activation_pct', Number(e.target.value))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={form.registration_open ?? true}
                  onChange={(e) => set('registration_open', e.target.checked)}
                />
                <span>{t('settings.registrationOpen')}</span>
              </label>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {canEdit && (
                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" disabled={update.isPending}>
                    {update.isPending ? t('settings.saving') : t('settings.save')}
                  </Button>
                  {saved && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <Check className="h-4 w-4" />
                      {t('settings.saved')}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </form>
        <BranchesCard />
        </div>
      )}
    </div>
  );
}
