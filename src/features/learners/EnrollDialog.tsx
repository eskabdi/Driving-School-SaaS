import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { invokeFunction } from '@/lib/functions';
import type { AppError } from '@/lib/errors';
import { usePackages } from '@/features/packages/api';
import type { LearnerRow } from './api';

/**
 * Enroll Learner dialog (spec §5.3.1). Picks a course package and calls the
 * enroll-learner Edge Function, which snapshots the package and issues the
 * first invoice.
 */
export function EnrollDialog({
  learner,
  open,
  onOpenChange,
}: {
  learner: LearnerRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const qc = useQueryClient();
  const { data: packages } = usePackages(claims?.tenant_id ?? null, { activeOnly: true });
  const [packageId, setPackageId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onEnroll() {
    setError(null);
    if (!packageId) {
      setError(t('enroll.packageRequired'));
      return;
    }
    setPending(true);
    try {
      const res = await invokeFunction<{ invoice_number: string }>('enroll-learner', {
        learnerId: learner.id,
        coursePackageId: packageId,
      });
      setDone(res.invoice_number);
      void qc.invalidateQueries({ queryKey: ['learners'] });
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('enroll.title')}</DialogTitle>
        <DialogDescription>
          {t('enroll.subtitle', { name: learner.full_name })}
        </DialogDescription>
      </DialogHeader>

      {done ? (
        <div className="space-y-2">
          <p className="text-sm">{t('enroll.success')}</p>
          <p className="text-sm text-muted-foreground">
            {t('enroll.invoiceNumber')}: <span className="font-mono">{done}</span>
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('action.cancel')}</Button>
          </DialogFooter>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="enroll-pkg">{t('enroll.package')}</Label>
            <select
              id="enroll-pkg"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              <option value="">{t('enroll.selectPackage')}</option>
              {packages?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.total_hours}h — {p.price.toLocaleString()} ETB
                </option>
              ))}
            </select>
            {packages && packages.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('enroll.noPackages')}</p>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('action.cancel')}
            </Button>
            <Button onClick={onEnroll} disabled={pending}>
              {pending ? t('enroll.enrolling') : t('enroll.confirm')}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
