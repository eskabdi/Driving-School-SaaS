import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

/** All tenants (super_admin only — RLS grants the bypass). */
export function useTenants() {
  return useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw normalizeError(error);
      return (data ?? []) as TenantRow[];
    },
  });
}

export interface CreateTenantInput {
  schoolName: string;
  slug: string;
  defaultLocale: 'en' | 'am' | 'om';
  dateCalendar: 'ethiopian' | 'gregorian';
  planCode: string;
  trialDays: number;
  adminFullName: string;
  adminEmail: string;
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) =>
      invokeFunction<{ tenant_id: string; slug: string }>('create-tenant', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'tenants'] }),
  });
}
