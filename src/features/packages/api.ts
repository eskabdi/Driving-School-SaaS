import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';

export interface PackageRow {
  id: string;
  name: string;
  license_category_code: string;
  total_hours: number;
  price: number;
  validity_days: number;
  required_transmission: 'manual' | 'automatic' | 'any';
  active: boolean;
}

export function usePackages(tenantId: string | null, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ['packages', tenantId, opts?.activeOnly ?? false],
    enabled: !!tenantId,
    queryFn: async (): Promise<PackageRow[]> => {
      let q = supabase
        .from('course_packages')
        .select(
          'id, name, license_category_code, total_hours, price, validity_days, required_transmission, active',
        )
        .is('archived_at', null)
        .order('name');
      if (opts?.activeOnly) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw normalizeError(error);
      return (data ?? []) as PackageRow[];
    },
  });
}

export interface CreatePackageInput {
  name: string;
  licenseCategoryCode: string;
  totalHours: number;
  price: number;
  validityDays: number;
  requiredTransmission: 'manual' | 'automatic' | 'any';
}

export function useCreatePackage() {
  const qc = useQueryClient();
  const { claims } = useAuth();
  return useMutation({
    mutationFn: async (input: CreatePackageInput) => {
      const { error } = await supabase.from('course_packages').insert({
        tenant_id: claims?.tenant_id,
        name: input.name,
        license_category_code: input.licenseCategoryCode,
        total_hours: input.totalHours,
        price: input.price,
        validity_days: input.validityDays,
        required_transmission: input.requiredTransmission,
      });
      if (error) throw normalizeError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
}
