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
import { useIssueCertificate, type CertificateType } from './api';

const TYPES: CertificateType[] = [
  'course_completion',
  'hours_completion',
  'skill_mastery',
  'mock_exam_pass',
  'enrollment_confirmation',
];

export function IssueCertificateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data: learners } = useLearners(claims?.tenant_id ?? null);
  const issue = useIssueCertificate();
  const [learnerId, setLearnerId] = useState('');
  const [type, setType] = useState<CertificateType>('course_completion');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ serial: string; code: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!learnerId) {
      setError(t('certificates.learnerRequired'));
      return;
    }
    try {
      const res = await issue.mutateAsync({ learnerId, certificateType: type });
      setResult({ serial: res.serial_number, code: res.verification_code });
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('certificates.issueTitle')}</DialogTitle>
        <DialogDescription>{t('certificates.issueSubtitle')}</DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-2">
          <p className="text-sm">{t('certificates.issued')}</p>
          <p className="text-sm text-muted-foreground">
            {t('certificates.serial')}: <span className="font-mono">{result.serial}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t('certificates.code')}: <span className="font-mono text-base">{result.code}</span>
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('action.cancel')}</Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cert-learner">{t('certificates.learner')}</Label>
            <select
              id="cert-learner"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value)}
            >
              <option value="">{t('certificates.selectLearner')}</option>
              {learners?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cert-type">{t('certificates.type')}</Label>
            <select
              id="cert-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as CertificateType)}
            >
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`certificateType.${ty}`)}
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
              {issue.isPending ? t('certificates.issuing') : t('certificates.issue')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
