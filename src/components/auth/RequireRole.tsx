import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import type { Role } from '@/lib/roles';

/**
 * Route guard that requires one of the given roles (blueprint §6).
 * UX-only — never the security boundary; RLS enforces the real access.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { claims } = useAuth();
  if (!claims?.role || !roles.includes(claims.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}
