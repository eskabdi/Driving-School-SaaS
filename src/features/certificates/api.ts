import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';

export type CertificateType =
  | 'course_completion'
  | 'hours_completion'
  | 'skill_mastery'
  | 'mock_exam_pass'
  | 'enrollment_confirmation';

export type CertificateStatus = 'active' | 'revoked' | 'expired';

export interface CertificateRow {
  id: string;
  serial_number: string;
  verification_code: string;
  certificate_type: CertificateType;
  status: CertificateStatus;
  issued_on: string;
  learner: { full_name: string } | null;
}

export function useCertificates(tenantId: string | null) {
  return useQuery({
    queryKey: ['certificates', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CertificateRow[]> => {
      const { data, error } = await supabase
        .from('certificates')
        .select('id, serial_number, verification_code, certificate_type, status, issued_on, learner:learners(full_name)')
        .order('created_at', { ascending: false })
        .range(0, 99);
      if (error) throw normalizeError(error);
      return (data ?? []) as unknown as CertificateRow[];
    },
  });
}

export interface IssueCertificateInput {
  learnerId: string;
  certificateType: CertificateType;
  enrollmentId?: string;
  validUntil?: string;
}

export function useIssueCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueCertificateInput) =>
      invokeFunction<{ serial_number: string; verification_code: string }>(
        'issue-certificate',
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }),
  });
}

export function useRevokeCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { certificateId: string; reason: string }) =>
      invokeFunction<{ status: string }>('revoke-certificate', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }),
  });
}

export interface VerifyResult {
  status: 'valid' | 'expired' | 'revoked' | 'not_found';
  certificate_type?: CertificateType;
  holder_initial?: string;
  issued_on?: string;
  school_name?: string;
}

/** Public verification — callable without a session (anon key). */
export async function verifyCertificate(code: string): Promise<VerifyResult> {
  return invokeFunction<VerifyResult>('verify-certificate', { code });
}
