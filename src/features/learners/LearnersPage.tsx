import { useTranslation } from 'react-i18next';
import { Loader2, Inbox } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { useLearners } from './api';

export function LearnersPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading, isError, error } = useLearners(claims?.tenant_id ?? null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.learners')} description={t('learners.subtitle')} />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="p-6 text-sm text-destructive">
              {(error as { detail?: string })?.detail ?? t('errors.INTERNAL')}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">{t('learners.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('learners.col.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('learners.col.phone')}</th>
                  <th className="px-4 py-3 font-medium">{t('learners.col.category')}</th>
                  <th className="px-4 py-3 font-medium">{t('learners.col.branch')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{l.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      {l.license_category_applied ? (
                        <Badge variant="secondary">{l.license_category_applied}</Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.branch?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
