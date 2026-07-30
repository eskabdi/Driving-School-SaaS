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
import type { AppError } from '@/lib/errors';
import { useLearners } from '@/features/learners/api';
import { useInstructors } from '@/features/instructors/api';
import { useIssueIdCard } from './api';

export function IssueIdCardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id ?? null;
  const { data: learners } = useLearners(tenantId);
  const { data: instructors } = useInstructors(tenantId);
  const issue = useIssueIdCard();
  const [holderType, setHolderType] = useState<'learner' | 'instructor'>('learner');
  const [holderId, setHolderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!holderId) {
      setError(t('idCards.holderRequired'));
      return;
    }
    try {
      const res = await issue.mutateAsync({
        holderType,
        learnerId: holderType === 'learner' ? holderId : undefined,
        instructorId: holderType === 'instructor' ? holderId : undefined,
      });
      setResult(res.card_number);
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('idCards.issueTitle')}</DialogTitle>
        <DialogDescription>{t('idCards.issueSubtitle')}</DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-2">
          <p className="text-sm">{t('idCards.issued')}</p>
          <p className="text-sm text-muted-foreground">
            {t('idCards.number')}: <span className="font-mono text-base">{result}</span>
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('action.cancel')}</Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="card-holder-type">{t('idCards.holderType')}</Label>
            <select
              id="card-holder-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={holderType}
              onChange={(e) => {
                setHolderType(e.target.value as 'learner' | 'instructor');
                setHolderId('');
              }}
            >
              <option value="learner">{t('idCards.learner')}</option>
              <option value="instructor">{t('idCards.instructor')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-holder">{t('idCards.holder')}</Label>
            <select
              id="card-holder"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={holderId}
              onChange={(e) => setHolderId(e.target.value)}
            >
              <option value="">{t('idCards.selectHolder')}</option>
              {(holderType === 'learner' ? learners : instructors)?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={issue.isPending}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={issue.isPending}>
              {issue.isPending ? t('idCards.issuing') : t('idCards.issue')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
