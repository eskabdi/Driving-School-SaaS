import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from './PageHeader';

/**
 * Placeholder for feature modules not yet built. The foundation scaffold wires
 * routing, guards, and layout; each module is filled in per spec §2/§5.
 */
export function ModulePlaceholder({
  titleKey,
  descriptionKey,
}: {
  titleKey: string;
  descriptionKey?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t(titleKey)}
        description={descriptionKey ? t(descriptionKey) : undefined}
      />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
          <Construction className="h-10 w-10" />
          <p className="max-w-md text-sm">{t('module.comingSoon')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
