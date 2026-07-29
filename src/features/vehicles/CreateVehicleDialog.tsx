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
import { useCreateVehicle } from './api';

export function CreateVehicleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateVehicle();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    plateNumber: '',
    transmission: 'manual' as 'manual' | 'automatic',
    make: '',
    model: '',
    insuranceExpiry: '',
    fitnessExpiry: '',
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
        <DialogTitle>{t('vehicles.createTitle')}</DialogTitle>
        <DialogDescription>{t('vehicles.createSubtitle')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="veh-plate">{t('vehicles.plate')}</Label>
            <Input
              id="veh-plate"
              required
              value={form.plateNumber}
              onChange={(e) => set('plateNumber', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="veh-trans">{t('vehicles.transmission')}</Label>
            <select
              id="veh-trans"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.transmission}
              onChange={(e) => set('transmission', e.target.value as 'manual' | 'automatic')}
            >
              <option value="manual">{t('vehicles.manual')}</option>
              <option value="automatic">{t('vehicles.automatic')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="veh-make">{t('vehicles.make')}</Label>
            <Input id="veh-make" value={form.make} onChange={(e) => set('make', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="veh-model">{t('vehicles.model')}</Label>
            <Input
              id="veh-model"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="veh-ins">{t('vehicles.insuranceExpiry')}</Label>
            <EthDatePicker
              id="veh-ins"
              value={form.insuranceExpiry}
              onChange={(v) => set('insuranceExpiry', v)}
              displayCalendar="ethiopian"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="veh-fit">{t('vehicles.fitnessExpiry')}</Label>
            <EthDatePicker
              id="veh-fit"
              value={form.fitnessExpiry}
              onChange={(v) => set('fitnessExpiry', v)}
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
            {create.isPending ? t('vehicles.creating') : t('vehicles.create')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
