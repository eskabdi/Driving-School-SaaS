import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { normalizeError } from './errors';
import { useAuth } from './auth-context';

/**
 * Platform feature flags (spec §4A). Resolution is: tenant override, else the
 * platform default. Flag reads are cached for 60s client-side, matching the
 * spec's guidance, so toggling a flag takes effect within a minute without a
 * reload storm.
 */
export type FlagKey =
  | 'payments.chapa'
  | 'payments.telebirr'
  | 'payments.online_any'
  | 'exams.mock_engine'
  | 'portal.learner'
  | 'portal.parent'
  | 'pwa.offline_attendance'
  | 'templates.designer_v2'
  | 'certificates.public_verification'
  | 'comms.sms'
  | 'comms.email'
  | 'comms.pause_all'
  | 'registration.public_form'
  | 'billing.enforce_limits'
  | 'platform.maintenance_banner';

export type FlagMap = Partial<Record<FlagKey, boolean>>;

export function useFeatureFlags() {
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id ?? null;

  return useQuery({
    queryKey: ['feature-flags', tenantId],
    staleTime: 60_000,
    queryFn: async (): Promise<FlagMap> => {
      const [{ data: defaults, error }, { data: overrides }] = await Promise.all([
        supabase.from('feature_flags').select('key, default_enabled'),
        tenantId
          ? supabase.from('feature_flag_overrides').select('flag_key, enabled')
          : Promise.resolve({ data: [] as Array<{ flag_key: string; enabled: boolean }> }),
      ]);
      if (error) throw normalizeError(error);

      const map: FlagMap = {};
      for (const row of (defaults ?? []) as Array<{ key: string; default_enabled: boolean }>) {
        map[row.key as FlagKey] = row.default_enabled;
      }
      for (const row of (overrides ?? []) as Array<{ flag_key: string; enabled: boolean }>) {
        map[row.flag_key as FlagKey] = row.enabled;
      }
      return map;
    },
  });
}

/** Convenience: read a single flag, defaulting to off while loading. */
export function useFeatureFlag(key: FlagKey): boolean {
  const { data } = useFeatureFlags();
  return data?.[key] ?? false;
}
