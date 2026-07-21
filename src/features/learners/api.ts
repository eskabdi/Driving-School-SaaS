import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';

export interface LearnerRow {
  id: string;
  full_name: string;
  phone: string | null;
  license_category_applied: string | null;
  branch: { name: string } | null;
  created_at: string;
}

/** List learners for the current tenant (RLS scopes rows automatically). */
export function useLearners(tenantId: string | null) {
  return useQuery({
    queryKey: ['learners', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<LearnerRow[]> => {
      const { data, error } = await supabase
        .from('learners')
        .select('id, full_name, phone, license_category_applied, branch:branches(name), created_at')
        .is('archived_at', null)
        .order('full_name')
        .range(0, 49);
      if (error) throw normalizeError(error);
      return (data ?? []) as unknown as LearnerRow[];
    },
  });
}
