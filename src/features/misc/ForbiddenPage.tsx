import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldX } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <ShieldX className="h-12 w-12 text-destructive" />
      <h1 className="text-2xl font-semibold">{t('forbidden.title')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('forbidden.subtitle')}</p>
      <Link to="/app" className={buttonVariants({ variant: 'outline' })}>
        {t('action.backHome')}
      </Link>
    </div>
  );
}
