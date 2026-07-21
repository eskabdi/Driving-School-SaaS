import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppError } from '@/lib/errors';
import { useCreateTenant } from './api';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Tenant Onboarding Wizard (spec §5.1.1) — single-screen form for the scaffold. */
export function OnboardTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTenant();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    schoolName: '',
    slug: '',
    defaultLocale: 'en' as 'en' | 'am' | 'om',
    dateCalendar: 'ethiopian' as 'ethiopian' | 'gregorian',
    planCode: 'starter',
    trialDays: 30,
    adminFullName: '',
    adminEmail: '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await create.mutateAsync(form);
      setResult(res.slug);
    } catch (err) {
      const ae = err as AppError;
      setError(ae.fields?.slug ?? ae.detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('platform.onboard.title')}</DialogTitle>
        <DialogDescription>{t('platform.onboard.subtitle')}</DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-2">
          <p className="text-sm">{t('platform.onboard.success', { slug: result })}</p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('action.cancel')}</Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school">{t('platform.onboard.schoolName')}</Label>
            <Input
              id="school"
              required
              value={form.schoolName}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  schoolName: name,
                  slug: f.slug || slugify(name),
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">{t('platform.onboard.slug')}</Label>
            <Input
              id="slug"
              required
              value={form.slug}
              onChange={(e) => set('slug', slugify(e.target.value))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="locale">{t('platform.onboard.locale')}</Label>
              <select
                id="locale"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.defaultLocale}
                onChange={(e) => set('defaultLocale', e.target.value as typeof form.defaultLocale)}
              >
                <option value="en">English</option>
                <option value="am">አማርኛ</option>
                <option value="om">Afaan Oromoo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan">{t('platform.onboard.plan')}</Label>
              <select
                id="plan"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.planCode}
                onChange={(e) => set('planCode', e.target.value)}
              >
                <option value="starter">Starter</option>
                <option value="standard">Standard</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-name">{t('platform.onboard.adminName')}</Label>
              <Input
                id="admin-name"
                required
                value={form.adminFullName}
                onChange={(e) => set('adminFullName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">{t('platform.onboard.adminEmail')}</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('platform.onboard.creating') : t('platform.onboard.create')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
