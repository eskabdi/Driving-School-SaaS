import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';

export interface InstructorRow {
  id: string;
  full_name: string;
  phone: string | null;
  license_number: string | null;
  license_expiry: string | null;
  status: 'active' | 'inactive';
  branch: { name: string } | null;
}

export function useInstructors(tenantId: string | null) {
  return useQuery({
    queryKey: ['instructors', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<InstructorRow[]> => {
      const { data, error } = await supabase
        .from('instructors')
        .select('id, full_name, phone, license_number, license_expiry, status, branch:branches(name)')
        .is('archived_at', null)
        .order('full_name');
      if (error) throw normalizeError(error);
      return (data ?? []) as unknown as InstructorRow[];
    },
  });
}

export interface CreateInstructorInput {
  fullName: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export function useCreateInstructor() {
  const qc = useQueryClient();
  const { claims } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateInstructorInput) => {
      const { error } = await supabase.from('instructors').insert({
        tenant_id: claims?.tenant_id,
        full_name: input.fullName,
        phone: input.phone || null,
        email: input.email || null,
        license_number: input.licenseNumber || null,
        license_expiry: input.licenseExpiry || null,
      });
      if (error) throw normalizeError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructors'] }),
  });
}
