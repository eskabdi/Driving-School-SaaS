import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Car } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatIsoAsEthiopian } from '@/lib/eth-calendar';
import type { SupportedLocale } from '@/lib/i18n';
import { useVehicles, type VehicleStatus } from './api';
import { CreateVehicleDialog } from './CreateVehicleDialog';

const STATUS_VARIANT: Record<VehicleStatus, BadgeProps['variant']> = {
  active: 'success',
  in_maintenance: 'warning',
  out_of_service: 'destructive',
  retired: 'outline',
};

export function VehiclesPage() {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useVehicles(claims?.tenant_id ?? null);
  const [creating, setCreating] = useState(false);
  const canManage = roleHasCapability(claims?.role, 'lessons.schedule');
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.vehicles')}
        description={t('vehicles.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t('vehicles.new')}
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
              <Car className="h-8 w-8" />
              <p className="text-sm">{t('vehicles.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('vehicles.plate')}</th>
                  <th className="px-4 py-3 font-medium">{t('vehicles.vehicle')}</th>
                  <th className="px-4 py-3 font-medium">{t('vehicles.transmission')}</th>
                  <th className="px-4 py-3 font-medium">{t('vehicles.insuranceExpiry')}</th>
                  <th className="px-4 py-3 font-medium">{t('vehicles.status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((v) => (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{v.plate_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[v.make, v.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {t(`vehicles.${v.transmission}`)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.insurance_expiry ? formatIsoAsEthiopian(v.insurance_expiry, locale) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[v.status]}>
                        {t(`vehicles.statusValue.${v.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {creating && <CreateVehicleDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
