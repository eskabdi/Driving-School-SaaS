import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { EthDatePicker } from '@/components/ethiopian-calendar/EthDatePicker';
import { LICENSE_CATEGORIES } from '@/lib/license-categories';
import { invokeFunction } from '@/lib/functions';
import type { AppError } from '@/lib/errors';

/**
 * Public, unauthenticated registration form (blueprint §14; spec §5.2.1) at
 * `/r/:slug`. Submits to the submit-public-registration Edge Function and shows
 * the returned tracking code. Turnstile + multi-step upload land per spec.
 */
export function PublicRegistrationPage() {
  const { t } = useTranslation();
  const { slug } = useParams();

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    gender: '',
    licenseCategoryApplied: '3',
    preferredSchedule: '',
    consent: false,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [alreadyReceived, setAlreadyReceived] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError(t('publicReg.consentRequired'));
      return;
    }
    setPending(true);
    try {
      const res = await invokeFunction<{ tracking_code: string | null; message?: string }>(
        'submit-public-registration',
        {
          tenantSlug: slug,
          fullName: form.fullName,
          phone: form.phone,
          email: form.email || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          licenseCategoryApplied: form.licenseCategoryApplied,
          preferredSchedule: form.preferredSchedule || undefined,
          consent: 'agreed',
        },
      );
      if (res.message === 'already_received' || !res.tracking_code) {
        setAlreadyReceived(true);
      } else {
        setTrackingCode(res.tracking_code);
      }
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    } finally {
      setPending(false);
    }
  }

  if (trackingCode || alreadyReceived) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle>{t('publicReg.successTitle')}</CardTitle>
            <CardDescription>
              {alreadyReceived ? t('publicReg.alreadyReceived') : t('publicReg.successBody')}
            </CardDescription>
          </CardHeader>
          {trackingCode && (
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('publicReg.trackingCode')}</p>
              <p className="mt-1 text-2xl font-bold tracking-widest">{trackingCode}</p>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('publicReg.title')}</CardTitle>
            <CardDescription>{t('publicReg.subtitle', { school: slug ?? '' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('publicReg.fullName')}</Label>
                <Input
                  id="fullName"
                  required
                  value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('publicReg.phone')}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+2519…"
                    required
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('publicReg.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">{t('publicReg.dob')}</Label>
                <EthDatePicker
                  id="dob"
                  value={form.dateOfBirth}
                  onChange={(v) => set('dateOfBirth', v)}
                  displayCalendar="ethiopian"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('publicReg.category')}</Label>
                <select
                  id="category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.licenseCategoryApplied}
                  onChange={(e) => set('licenseCategoryApplied', e.target.value)}
                >
                  {LICENSE_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                />
                <span>{t('publicReg.consent')}</span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t('publicReg.submitting') : t('publicReg.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
