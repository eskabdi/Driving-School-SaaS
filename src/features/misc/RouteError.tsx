import { useRouteError, Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';

/**
 * Router-level error boundary (spec §5.7.1 Global Error Dialog surface).
 * Catches chunk-load failures and unhandled route errors.
 */
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'Something went wrong';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <button className={buttonVariants({ variant: 'default' })} onClick={() => location.reload()}>
          Reload
        </button>
        <Link to="/app" className={buttonVariants({ variant: 'outline' })}>
          Home
        </Link>
      </div>
    </div>
  );
}
