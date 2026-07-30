import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Megaphone } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatIsoAsEthiopian } from '@/lib/eth-calendar';
import type { SupportedLocale } from '@/lib/i18n';
import { useAnnouncements } from './api';
import { ComposeAnnouncementDialog } from './ComposeAnnouncementDialog';

export function CommunicationPage() {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useAnnouncements(claims?.tenant_id ?? null);
  const [composing, setComposing] = useState(false);
  const canCompose = roleHasCapability(claims?.role, 'settings.edit');
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.communication')}
        description={t('comms.subtitle')}
        actions={
          canCompose ? (
            <Button onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" />
              {t('comms.compose')}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Megaphone className="h-8 w-8" />
            <p className="text-sm">{t('comms.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <Badge variant="secondary">{t(`comms.audienceValue.${a.audience}`)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatIsoAsEthiopian(a.published_at, locale)}
                </p>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{a.body}</CardContent>
            </Card>
          ))}
        </div>
      )}

      {composing && <ComposeAnnouncementDialog open={composing} onOpenChange={setComposing} />}
    </div>
  );
}
