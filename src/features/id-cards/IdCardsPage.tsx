import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, IdCard } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatIsoAsEthiopian } from '@/lib/eth-calendar';
import type { SupportedLocale } from '@/lib/i18n';
import { useIdCards, type CardStatus } from './api';
import { IssueIdCardDialog } from './IssueIdCardDialog';

const STATUS_VARIANT: Record<CardStatus, BadgeProps['variant']> = {
  draft: 'outline',
  active: 'success',
  lost: 'warning',
  replaced: 'outline',
  expired: 'outline',
  revoked: 'destructive',
};

export function IdCardsPage() {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useIdCards(claims?.tenant_id ?? null);
  const [issuing, setIssuing] = useState(false);
  const canIssue = roleHasCapability(claims?.role, 'cards_certs.issue');
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.idCards')}
        description={t('idCards.subtitle')}
        actions={
          canIssue ? (
            <Button onClick={() => setIssuing(true)}>
              <Plus className="h-4 w-4" />
              {t('idCards.issue')}
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
              <IdCard className="h-8 w-8" />
              <p className="text-sm">{t('idCards.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('idCards.number')}</th>
                  <th className="px-4 py-3 font-medium">{t('idCards.holder')}</th>
                  <th className="px-4 py-3 font-medium">{t('idCards.holderType')}</th>
                  <th className="px-4 py-3 font-medium">{t('idCards.expiresOn')}</th>
                  <th className="px-4 py-3 font-medium">{t('idCards.statusLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{c.card_number}</td>
                    <td className="px-4 py-3 font-medium">
                      {c.holder_type === 'learner'
                        ? (c.learner?.full_name ?? '—')
                        : (c.instructor?.full_name ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t(`idCards.${c.holder_type}`)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.expires_on ? formatIsoAsEthiopian(c.expires_on, locale) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[c.status]}>
                        {t(`cardStatus.${c.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {issuing && <IssueIdCardDialog open={issuing} onOpenChange={setIssuing} />}
    </div>
  );
}
