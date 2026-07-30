import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth-context';
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
import { useInstructors } from '@/features/instructors/api';
import { useLearners } from '@/features/learners/api';
import { useVehicles } from '@/features/vehicles/api';
import { useScheduleLesson } from './api';

// Ethiopia has no DST; wall-clock time is a fixed +03:00 offset.
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}

export function ScheduleLessonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id ?? null;
  const { data: instructors } = useInstructors(tenantId);
  const { data: learners } = useLearners(tenantId);
  const { data: vehicles } = useVehicles(tenantId);
  const schedule = useScheduleLesson();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    instructorId: '',
    learnerId: '',
    vehicleId: '',
    lessonType: 'practical' as 'theory' | 'practical' | 'simulator',
    date: '',
    startTime: '09:00',
    durationMin: 60,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.instructorId || !form.learnerId || !form.date) {
      setError(t('schedule.missingFields'));
      return;
    }
    const start = toIso(form.date, form.startTime);
    const end = new Date(new Date(start).getTime() + form.durationMin * 60_000).toISOString();
    try {
      await schedule.mutateAsync({
        instructorId: form.instructorId,
        learnerId: form.learnerId,
        vehicleId: form.vehicleId || undefined,
        lessonType: form.lessonType,
        scheduledStart: start,
        scheduledEnd: end,
      });
      onOpenChange(false);
    } catch (err) {
      const ae = err as AppError;
      // The DB exclusion constraint surfaces as SCHED_CONFLICT (spec §7.4).
      setError(
        ae.code === 'SCHED_CONFLICT'
          ? t('schedule.conflict')
          : (ae.detail ?? t('errors.INTERNAL')),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('schedule.title')}</DialogTitle>
        <DialogDescription>{t('schedule.subtitle')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sch-type">{t('schedule.type')}</Label>
            <select
              id="sch-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.lessonType}
              onChange={(e) => set('lessonType', e.target.value as typeof form.lessonType)}
            >
              <option value="theory">{t('schedule.theory')}</option>
              <option value="practical">{t('schedule.practical')}</option>
              <option value="simulator">{t('schedule.simulator')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sch-instructor">{t('schedule.instructor')}</Label>
            <select
              id="sch-instructor"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.instructorId}
              onChange={(e) => set('instructorId', e.target.value)}
            >
              <option value="">{t('schedule.select')}</option>
              {instructors?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sch-learner">{t('schedule.learner')}</Label>
            <select
              id="sch-learner"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.learnerId}
              onChange={(e) => set('learnerId', e.target.value)}
            >
              <option value="">{t('schedule.select')}</option>
              {learners?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sch-vehicle">{t('schedule.vehicle')}</Label>
            <select
              id="sch-vehicle"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.vehicleId}
              onChange={(e) => set('vehicleId', e.target.value)}
            >
              <option value="">{t('schedule.noVehicle')}</option>
              {vehicles
                ?.filter((v) => v.status === 'active')
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sch-date">{t('schedule.date')}</Label>
            <EthDatePicker
              id="sch-date"
              value={form.date}
              onChange={(v) => set('date', v)}
              displayCalendar="ethiopian"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="sch-time">{t('schedule.startTime')}</Label>
              <Input
                id="sch-time"
                type="time"
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-dur">{t('schedule.duration')}</Label>
              <Input
                id="sch-dur"
                type="number"
                min={15}
                step={15}
                value={form.durationMin}
                onChange={(e) => set('durationMin', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={schedule.isPending}
          >
            {t('action.cancel')}
          </Button>
          <Button type="submit" disabled={schedule.isPending}>
            {schedule.isPending ? t('schedule.scheduling') : t('schedule.confirm')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
