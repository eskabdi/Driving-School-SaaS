import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { useOpenInvoices, type InvoiceRow, type InvoiceStatus } from './api';
import { RecordPaymentDialog } from './RecordPaymentDialog';

const STATUS_VARIANT: Record<InvoiceStatus, BadgeProps['variant']> = {
  draft: 'outline',
  issued: 'secondary',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'destructive',
  void: 'outline',
  refunded: 'outline',
};

export function FinancePage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useOpenInvoices(claims?.tenant_id ?? null);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const canRecord = roleHasCapability(claims?.role, 'payments.record_cash');

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.finance')} description={t('finance.subtitle')} />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Wallet className="h-8 w-8" />
              <p className="text-sm">{t('finance.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('finance.invoice')}</th>
                  <th className="px-4 py-3 font-medium">{t('finance.learner')}</th>
                  <th className="px-4 py-3 font-medium">{t('finance.total')}</th>
                  <th className="px-4 py-3 font-medium">{t('finance.balance')}</th>
                  <th className="px-4 py-3 font-medium">{t('finance.statusLabel')}</th>
                  {canRecord && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{inv.number ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{inv.learner?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inv.amount.toLocaleString()} ETB
                    </td>
                    <td className="px-4 py-3 font-medium">{inv.balance.toLocaleString()} ETB</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[inv.status]}>
                        {t(`invoiceStatus.${inv.status}`)}
                      </Badge>
                    </td>
                    {canRecord && (
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setPaying(inv)}>
                          {t('finance.record')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {paying && (
        <RecordPaymentDialog
          invoice={paying}
          open={!!paying}
          onOpenChange={(o) => !o && setPaying(null)}
        />
      )}
    </div>
  );
}
