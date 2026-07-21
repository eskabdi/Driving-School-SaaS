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
import { LICENSE_CATEGORIES } from '@/lib/license-categories';
import type { AppError } from '@/lib/errors';
import { useCreatePackage } from './api';

export function CreatePackageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreatePackage();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    licenseCategoryCode: '3',
    totalHours: 30,
    price: 0,
    validityDays: 180,
    requiredTransmission: 'any' as 'manual' | 'automatic' | 'any',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync(form);
      onOpenChange(false);
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('packages.createTitle')}</DialogTitle>
        <DialogDescription>{t('packages.createSubtitle')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pkg-name">{t('packages.name')}</Label>
          <Input
            id="pkg-name"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pkg-cat">{t('packages.category')}</Label>
            <select
              id="pkg-cat"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.licenseCategoryCode}
              onChange={(e) => set('licenseCategoryCode', e.target.value)}
            >
              {LICENSE_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-trans">{t('packages.transmission')}</Label>
            <select
              id="pkg-trans"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.requiredTransmission}
              onChange={(e) =>
                set('requiredTransmission', e.target.value as typeof form.requiredTransmission)
              }
            >
              <option value="any">{t('packages.transAny')}</option>
              <option value="manual">{t('packages.transManual')}</option>
              <option value="automatic">{t('packages.transAuto')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-hours">{t('packages.hours')}</Label>
            <Input
              id="pkg-hours"
              type="number"
              min={1}
              required
              value={form.totalHours}
              onChange={(e) => set('totalHours', Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-price">{t('packages.price')}</Label>
            <Input
              id="pkg-price"
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(e) => set('price', Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-validity">{t('packages.validity')}</Label>
            <Input
              id="pkg-validity"
              type="number"
              min={1}
              required
              value={form.validityDays}
              onChange={(e) => set('validityDays', Number(e.target.value))}
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
            {create.isPending ? t('packages.creating') : t('packages.create')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
