import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';

export type Audience = 'all' | 'learners' | 'instructors' | 'staff' | 'branch';

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  published_at: string;
}

export function useAnnouncements(tenantId: string | null) {
  return useQuery({
    queryKey: ['announcements', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, audience, published_at')
        .is('archived_at', null)
        .order('published_at', { ascending: false })
        .range(0, 49);
      if (error) throw normalizeError(error);
      return (data ?? []) as AnnouncementRow[];
    },
  });
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audience: Audience;
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  const { claims } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateAnnouncementInput) => {
      const { error } = await supabase.from('announcements').insert({
        tenant_id: claims?.tenant_id,
        title: input.title,
        body: input.body,
        audience: input.audience,
        created_by: claims?.user_id,
      });
      if (error) throw normalizeError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}
