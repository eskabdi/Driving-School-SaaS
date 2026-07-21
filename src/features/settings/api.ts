import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';

export interface TenantSettings {
  tenant_id: string;
  default_locale: 'en' | 'am' | 'om';
  date_calendar: 'ethiopian' | 'gregorian';
  timezone: string;
  currency: string;
  lesson_slot_minutes: number;
  late_cancel_hours: number;
  min_activation_pct: number;
  registration_open: boolean;
}

const COLUMNS =
  'tenant_id, default_locale, date_calendar, timezone, currency, lesson_slot_minutes, late_cancel_hours, min_activation_pct, registration_open';

export function useTenantSettings(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant_settings', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantSettings | null> => {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw normalizeError(error);
      return (data as TenantSettings) ?? null;
    },
  });
}

export type SettingsPatch = Partial<Omit<TenantSettings, 'tenant_id'>>;

export function useUpdateTenantSettings(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      const { error } = await supabase
        .from('tenant_settings')
        .update(patch)
        .eq('tenant_id', tenantId);
      if (error) throw normalizeError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant_settings', tenantId] }),
  });
}
