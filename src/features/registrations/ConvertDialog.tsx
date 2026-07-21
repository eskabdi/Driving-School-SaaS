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
import { Label } from '@/components/ui/label';
import { useBranches, useReviewSubmission, type SubmissionRow } from './api';
import type { AppError } from '@/lib/errors';

/**
 * Convert-to-Learner dialog (spec §5.2.3, step 1). Picks the branch and calls
 * the review-public-registration EF (convert action), which creates the learner
 * and moves the KYC files server-side.
 */
export function ConvertDialog({
  submission,
  open,
  onOpenChange,
}: {
  submission: SubmissionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data: branches } = useBranches(claims?.tenant_id ?? null);
  const review = useReviewSubmission();
  const [branchId, setBranchId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onConvert() {
    setError(null);
    if (!branchId) {
      setError(t('convert.branchRequired'));
      return;
    }
    try {
      await review.mutateAsync({ submissionId: submission.id, action: 'convert', branchId });
      onOpenChange(false);
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('convert.title')}</DialogTitle>
        <DialogDescription>
          {t('convert.subtitle', { name: submission.full_name })}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="branch">{t('convert.branch')}</Label>
        <select
          id="branch"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="">{t('convert.selectBranch')}</option>
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={review.isPending}>
          {t('action.cancel')}
        </Button>
        <Button onClick={onConvert} disabled={review.isPending}>
          {review.isPending ? t('convert.converting') : t('convert.confirm')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
