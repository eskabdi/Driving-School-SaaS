import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';

export type CardStatus = 'draft' | 'active' | 'lost' | 'replaced' | 'expired' | 'revoked';

export interface IdCardRow {
  id: string;
  card_number: string;
  holder_type: 'learner' | 'instructor';
  status: CardStatus;
  issued_on: string;
  expires_on: string | null;
  learner: { full_name: string } | null;
  instructor: { full_name: string } | null;
}

export function useIdCards(tenantId: string | null) {
  return useQuery({
    queryKey: ['id-cards', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<IdCardRow[]> => {
      const { data, error } = await supabase
        .from('id_cards')
        .select(
          'id, card_number, holder_type, status, issued_on, expires_on, learner:learners(full_name), instructor:instructors(full_name)',
        )
        .order('created_at', { ascending: false })
        .range(0, 99);
      if (error) throw normalizeError(error);
      return (data ?? []) as unknown as IdCardRow[];
    },
  });
}

export interface IssueIdCardInput {
  holderType: 'learner' | 'instructor';
  learnerId?: string;
  instructorId?: string;
}

export function useIssueIdCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueIdCardInput) =>
      invokeFunction<{ card_id: string; card_number: string }>('issue-id-card', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['id-cards'] }),
  });
}
