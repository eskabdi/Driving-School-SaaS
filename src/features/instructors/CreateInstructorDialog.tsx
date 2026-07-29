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
import { EthDatePicker } from '@/components/ethiopian-calendar/EthDatePicker';
import type { AppError } from '@/lib/errors';
import { useCreateInstructor } from './api';

export function CreateInstructorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateInstructor();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    licenseNumber: '',
    licenseExpiry: '',
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
        <DialogTitle>{t('instructors.createTitle')}</DialogTitle>
        <DialogDescription>{t('instructors.createSubtitle')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ins-name">{t('instructors.name')}</Label>
          <Input
            id="ins-name"
            required
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ins-phone">{t('instructors.phone')}</Label>
            <Input
              id="ins-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ins-email">{t('instructors.email')}</Label>
            <Input
              id="ins-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ins-license">{t('instructors.licenseNumber')}</Label>
            <Input
              id="ins-license"
              value={form.licenseNumber}
              onChange={(e) => set('licenseNumber', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ins-expiry">{t('instructors.licenseExpiry')}</Label>
            <EthDatePicker
              id="ins-expiry"
              value={form.licenseExpiry}
              onChange={(v) => set('licenseExpiry', v)}
              displayCalendar="ethiopian"
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
            {create.isPending ? t('instructors.creating') : t('instructors.create')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
