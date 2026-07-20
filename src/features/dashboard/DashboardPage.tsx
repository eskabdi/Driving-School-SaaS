import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';

export function DashboardPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();

  const stats = [
    { key: 'stats.activeLearners', value: '—' },
    { key: 'stats.lessonsToday', value: '—' },
    { key: 'stats.instructors', value: '—' },
    { key: 'stats.revenueMtd', value: '—' },
  ];

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
        <CardContent className="text-sm text-muted-foreground">
          {claims?.tenant_id
            ? t('dashboard.actionCenterEmpty')
            : t('dashboard.noTenant')}
        </CardContent>
      </Card>
    </div>
  );
}
