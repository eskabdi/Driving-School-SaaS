import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Package } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { roleHasCapability } from '@/lib/roles';
import { usePackages } from './api';
import { CreatePackageDialog } from './CreatePackageDialog';

export function PackagesPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = usePackages(claims?.tenant_id ?? null);
  const [creating, setCreating] = useState(false);
  const canManage = roleHasCapability(claims?.role, 'settings.edit');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.packages')}
        description={t('packages.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t('packages.new')}
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
              <Package className="h-8 w-8" />
              <p className="text-sm">{t('packages.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('packages.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('packages.category')}</th>
                  <th className="px-4 py-3 font-medium">{t('packages.hours')}</th>
                  <th className="px-4 py-3 font-medium">{t('packages.price')}</th>
                  <th className="px-4 py-3 font-medium">{t('packages.transmission')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{p.license_category_code}</Badge>
                    </td>
                    <td className="px-4 py-3">{p.total_hours}</td>
                    <td className="px-4 py-3">{p.price.toLocaleString()} ETB</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {p.required_transmission}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {creating && <CreatePackageDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
