import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';

export type VehicleStatus = 'active' | 'in_maintenance' | 'out_of_service' | 'retired';

export interface VehicleRow {
  id: string;
  plate_number: string;
  transmission: 'manual' | 'automatic';
  make: string | null;
  model: string | null;
  status: VehicleStatus;
  insurance_expiry: string | null;
  fitness_expiry: string | null;
}

export function useVehicles(tenantId: string | null) {
  return useQuery({
    queryKey: ['vehicles', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<VehicleRow[]> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, plate_number, transmission, make, model, status, insurance_expiry, fitness_expiry')
        .is('archived_at', null)
        .order('plate_number');
      if (error) throw normalizeError(error);
      return (data ?? []) as VehicleRow[];
    },
  });
}

export interface CreateVehicleInput {
  plateNumber: string;
  transmission: 'manual' | 'automatic';
  make?: string;
  model?: string;
  insuranceExpiry?: string;
  fitnessExpiry?: string;
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  const { claims } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateVehicleInput) => {
      const { error } = await supabase.from('vehicles').insert({
        tenant_id: claims?.tenant_id,
        plate_number: input.plateNumber,
        transmission: input.transmission,
        make: input.make || null,
        model: input.model || null,
        insurance_expiry: input.insuranceExpiry || null,
        fitness_expiry: input.fitnessExpiry || null,
      });
      if (error) throw normalizeError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}
