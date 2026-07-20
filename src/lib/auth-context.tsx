import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Role } from './roles';
import type { SupportedLocale } from './i18n';

/**
 * Auth context (blueprint §4, §9). The custom access-token hook injects
 * tenant_id, user_id, role, branch_id, user_status and tenant_status into the
 * JWT (spec §6.3). We decode those claims here for UX/route-guard use only —
 * the real security boundary is RLS + Edge Function checks.
 */

export interface AuthClaims {
  sub: string; // auth uid
  tenant_id: string | null;
  user_id: string | null; // public.users.id
  role: Role | null;
  branch_id: string | null;
  user_status: string | null;
  tenant_status: string | null;
  impersonator_user_id?: string;
  locale?: SupportedLocale;
}

interface AuthContextValue {
  session: Session | null;
  claims: AuthClaims | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeClaims(session: Session | null): AuthClaims | null {
  if (!session?.access_token) return null;
  try {
    const payload = session.access_token.split('.')[1];
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    ) as Partial<AuthClaims> & { sub: string };
    return {
      sub: payload ? json.sub : session.user.id,
      tenant_id: json.tenant_id ?? null,
      user_id: json.user_id ?? null,
      role: (json.role as Role) ?? null,
      branch_id: json.branch_id ?? null,
      user_status: json.user_status ?? null,
      tenant_status: json.tenant_status ?? null,
      impersonator_user_id: json.impersonator_user_id,
      locale: json.locale,
    };
  } catch {
    // JWT without custom claims yet (fresh signup before hook runs).
    return {
      sub: session.user.id,
      tenant_id: null,
      user_id: null,
      role: null,
      branch_id: null,
      user_status: null,
      tenant_status: null,
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      claims: decodeClaims(session),
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
