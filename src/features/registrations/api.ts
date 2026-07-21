import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';

export type SubmissionStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'expired';

export interface SubmissionRow {
  id: string;
  tracking_code: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  license_category_applied: string | null;
  preferred_schedule: string | null;
  status: SubmissionStatus;
  created_at: string;
  created_learner_id: string | null;
}

const ACTIVE: SubmissionStatus[] = ['submitted', 'under_review', 'approved'];

export function useSubmissions(tenantId: string | null) {
  return useQuery({
    queryKey: ['submissions', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<SubmissionRow[]> => {
      const { data, error } = await supabase
        .from('public_registration_submissions')
        .select(
          'id, tracking_code, full_name, phone, email, license_category_applied, preferred_schedule, status, created_at, created_learner_id',
        )
        .in('status', ACTIVE)
        .order('created_at', { ascending: false })
        .range(0, 99);
      if (error) throw normalizeError(error);
      return (data ?? []) as SubmissionRow[];
    },
  });
}

export interface ReviewInput {
  submissionId: string;
  action: 'claim' | 'approve' | 'reject' | 'convert';
  rejectedReason?: 'incomplete_docs' | 'duplicate' | 'ineligible' | 'spam' | 'other';
  branchId?: string;
}

export function useReviewSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) =>
      invokeFunction<{ status: string; learner_id?: string }>(
        'review-public-registration',
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      void qc.invalidateQueries({ queryKey: ['learners'] });
    },
  });
}

export interface BranchRow {
  id: string;
  name: string;
}

export function useBranches(tenantId: string | null) {
  return useQuery({
    queryKey: ['branches', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<BranchRow[]> => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .is('archived_at', null)
        .order('name');
      if (error) throw normalizeError(error);
      return (data ?? []) as BranchRow[];
    },
  });
}
