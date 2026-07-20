import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-5xl font-bold text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('notFound.subtitle')}</p>
      <Link to="/app" className={buttonVariants({ variant: 'outline' })}>
        {t('action.backHome')}
      </Link>
    </div>
  );
}
