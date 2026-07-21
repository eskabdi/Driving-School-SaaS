import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { FullPageSpinner } from '@/components/layout/FullPageSpinner';

/** Send super admins to the platform console, everyone else to the tenant app. */
export function RootRedirect() {
  const { loading, session, claims } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (claims?.role === 'super_admin') return <Navigate to="/platform" replace />;
  return <Navigate to="/app" replace />;
}
