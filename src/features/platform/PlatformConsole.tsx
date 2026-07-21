import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Building2, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useTenants } from './api';
import { OnboardTenantDialog } from './OnboardTenantDialog';

const TENANT_STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  trial: 'secondary',
  active: 'success',
  past_due: 'warning',
  suspended: 'destructive',
  offboarding: 'warning',
  archived: 'outline',
};

/**
 * Super Admin Platform Console (spec §3.1.1). Separate route tree from the
 * tenant UI. This scaffold implements the tenants list + onboarding wizard.
 */
export function PlatformConsole() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { data, isLoading } = useTenants();
  const [onboarding, setOnboarding] = useState(false);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="flex h-16 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-2 font-semibold">
          <Building2 className="h-5 w-5" />
          {t('platform.title')}
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            {t('action.signOut')}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <PageHeader
          title={t('platform.tenants')}
          description={t('platform.tenantsSubtitle')}
          actions={
            <Button onClick={() => setOnboarding(true)}>
              <Plus className="h-4 w-4" />
              {t('platform.onboardTenant')}
            </Button>
          }
        />

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !data || data.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <Building2 className="h-8 w-8" />
                <p className="text-sm">{t('platform.noTenants')}</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('platform.col.name')}</th>
                    <th className="px-4 py-3 font-medium">{t('platform.col.slug')}</th>
                    <th className="px-4 py-3 font-medium">{t('platform.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((tenant) => (
                    <tr key={tenant.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{tenant.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {tenant.slug}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={TENANT_STATUS_VARIANT[tenant.status] ?? 'secondary'}>
                          {t(`tenantStatus.${tenant.status}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>

      {onboarding && <OnboardTenantDialog open={onboarding} onOpenChange={setOnboarding} />}
    </div>
  );
}
