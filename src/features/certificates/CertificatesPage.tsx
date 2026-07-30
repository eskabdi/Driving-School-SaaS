import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, BadgeCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatIsoAsEthiopian } from '@/lib/eth-calendar';
import type { SupportedLocale } from '@/lib/i18n';
import {
  useCertificates,
  useRevokeCertificate,
  type CertificateStatus,
} from './api';
import { IssueCertificateDialog } from './IssueCertificateDialog';

const STATUS_VARIANT: Record<CertificateStatus, BadgeProps['variant']> = {
  active: 'success',
  revoked: 'destructive',
  expired: 'outline',
};

export function CertificatesPage() {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useCertificates(claims?.tenant_id ?? null);
  const revoke = useRevokeCertificate();
  const [issuing, setIssuing] = useState(false);
  const canIssue = roleHasCapability(claims?.role, 'cards_certs.issue');
  const canRevoke = roleHasCapability(claims?.role, 'certs.revoke');
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  function onRevoke(id: string) {
    const reason = window.prompt(t('certificates.revokeReason'));
    if (reason && reason.trim().length >= 3) {
      revoke.mutate({ certificateId: id, reason: reason.trim() });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.certificates')}
        description={t('certificates.subtitle')}
        actions={
          canIssue ? (
            <Button onClick={() => setIssuing(true)}>
              <Plus className="h-4 w-4" />
              {t('certificates.issue')}
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
              <BadgeCheck className="h-8 w-8" />
              <p className="text-sm">{t('certificates.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('certificates.serial')}</th>
                  <th className="px-4 py-3 font-medium">{t('certificates.learner')}</th>
                  <th className="px-4 py-3 font-medium">{t('certificates.type')}</th>
                  <th className="px-4 py-3 font-medium">{t('certificates.issuedOn')}</th>
                  <th className="px-4 py-3 font-medium">{t('certificates.statusLabel')}</th>
                  {canRevoke && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{c.serial_number}</td>
                    <td className="px-4 py-3 font-medium">{c.learner?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">{t(`certificateType.${c.certificate_type}`)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatIsoAsEthiopian(c.issued_on, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[c.status]}>
                        {t(`certificateStatus.${c.status}`)}
                      </Badge>
                    </td>
                    {canRevoke && (
                      <td className="px-4 py-3 text-right">
                        {c.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={revoke.isPending}
                            onClick={() => onRevoke(c.id)}
                          >
                            {t('certificates.revoke')}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {issuing && <IssueCertificateDialog open={issuing} onOpenChange={setIssuing} />}
    </div>
  );
}
