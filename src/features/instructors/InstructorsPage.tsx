import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatIsoAsEthiopian } from '@/lib/eth-calendar';
import type { SupportedLocale } from '@/lib/i18n';
import { useInstructors } from './api';
import { CreateInstructorDialog } from './CreateInstructorDialog';

export function InstructorsPage() {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useInstructors(claims?.tenant_id ?? null);
  const [creating, setCreating] = useState(false);
  const canManage = roleHasCapability(claims?.role, 'users.manage');
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.instructors')}
        description={t('instructors.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t('instructors.new')}
            </Button>
          ) : undefined
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
              <Users className="h-8 w-8" />
              <p className="text-sm">{t('instructors.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('instructors.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('instructors.phone')}</th>
                  <th className="px-4 py-3 font-medium">{t('instructors.licenseNumber')}</th>
                  <th className="px-4 py-3 font-medium">{t('instructors.licenseExpiry')}</th>
                  <th className="px-4 py-3 font-medium">{t('instructors.status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((ins) => (
                  <tr key={ins.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{ins.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ins.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ins.license_number ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ins.license_expiry ? formatIsoAsEthiopian(ins.license_expiry, locale) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ins.status === 'active' ? 'success' : 'secondary'}>
                        {t(`instructors.statusValue.${ins.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {creating && <CreateInstructorDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
