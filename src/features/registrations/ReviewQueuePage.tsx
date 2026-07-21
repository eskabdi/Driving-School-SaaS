import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Inbox } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  useSubmissions,
  useReviewSubmission,
  type SubmissionRow,
  type SubmissionStatus,
} from './api';
import { ConvertDialog } from './ConvertDialog';

const STATUS_VARIANT: Record<SubmissionStatus, BadgeProps['variant']> = {
  submitted: 'secondary',
  under_review: 'warning',
  approved: 'default',
  rejected: 'destructive',
  converted: 'success',
  expired: 'outline',
};

export function ReviewQueuePage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useSubmissions(claims?.tenant_id ?? null);
  const review = useReviewSubmission();
  const [converting, setConverting] = useState<SubmissionRow | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('reviewQueue.title')} description={t('reviewQueue.subtitle')} />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">{t('reviewQueue.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('reviewQueue.col.code')}</th>
                  <th className="px-4 py-3 font-medium">{t('reviewQueue.col.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('reviewQueue.col.phone')}</th>
                  <th className="px-4 py-3 font-medium">{t('reviewQueue.col.status')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('reviewQueue.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{s.tracking_code ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{s.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.phone}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[s.status]}>{t(`submissionStatus.${s.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {s.status === 'submitted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={review.isPending}
                            onClick={() =>
                              review.mutate({ submissionId: s.id, action: 'claim' })
                            }
                          >
                            {t('reviewQueue.action.claim')}
                          </Button>
                        )}
                        {s.status === 'under_review' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={review.isPending}
                              onClick={() =>
                                review.mutate({
                                  submissionId: s.id,
                                  action: 'reject',
                                  rejectedReason: 'other',
                                })
                              }
                            >
                              {t('reviewQueue.action.reject')}
                            </Button>
                            <Button
                              size="sm"
                              disabled={review.isPending}
                              onClick={() =>
                                review.mutate({ submissionId: s.id, action: 'approve' })
                              }
                            >
                              {t('reviewQueue.action.approve')}
                            </Button>
                          </>
                        )}
                        {s.status === 'approved' && (
                          <Button size="sm" onClick={() => setConverting(s)}>
                            {t('reviewQueue.action.convert')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {converting && (
        <ConvertDialog
          submission={converting}
          open={!!converting}
          onOpenChange={(o) => !o && setConverting(null)}
        />
      )}
    </div>
  );
}
