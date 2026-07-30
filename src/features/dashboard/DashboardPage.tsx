import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { useDashboardStats } from './api';

export function DashboardPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { tenantSlug } = useParams();
  const base = tenantSlug ? `/app/manage/${tenantSlug}` : '/app';
  const { data, isLoading } = useDashboardStats(claims?.tenant_id ?? null);

  const dash = (v: number | undefined) => (isLoading || v === undefined ? '—' : v.toLocaleString());

  const stats = [
    { key: 'stats.activeLearners', value: dash(data?.activeLearners) },
    { key: 'stats.lessonsToday', value: dash(data?.lessonsToday) },
    { key: 'stats.instructors', value: dash(data?.instructors) },
    {
      key: 'stats.revenueMtd',
      value: data ? `${data.revenueMtd.toLocaleString()} ETB` : '—',
    },
  ];

  const hasReviews = (data?.pendingReviews ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.dashboard')} description={t('dashboard.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.key}>
            <CardHeader className="pb-2">
              <CardDescription>{t(s.key)}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.actionCenter')}</CardTitle>
          <CardDescription>{t('dashboard.actionCenterSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {!claims?.tenant_id ? (
            <p className="text-muted-foreground">{t('dashboard.noTenant')}</p>
          ) : hasReviews ? (
            <Link
              to={`${base}/registrations`}
              className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                {t('dashboard.pendingReviews', { count: data?.pendingReviews ?? 0 })}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ) : (
            <p className="text-muted-foreground">{t('dashboard.actionCenterEmpty')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
