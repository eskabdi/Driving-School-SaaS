import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';

export interface BranchRow {
  id: string;
  name: string;
  city: string | null;
}

export function useBranchList(tenantId: string | null) {
  return useQuery({
    queryKey: ['branches', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<BranchRow[]> => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, city')
        .is('archived_at', null)
        .order('name');
      if (error) throw normalizeError(error);
      return (data ?? []) as BranchRow[];
    },
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  const { claims } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; city?: string }) => {
      const { error } = await supabase.from('branches').insert({
        tenant_id: claims?.tenant_id,
        name: input.name,
        city: input.city || null,
      });
      if (error) throw normalizeError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}
