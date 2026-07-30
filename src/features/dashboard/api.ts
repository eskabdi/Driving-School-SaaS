import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';

export interface DashboardStats {
  activeLearners: number;
  lessonsToday: number;
  instructors: number;
  revenueMtd: number;
  pendingReviews: number;
}

// Africa/Addis_Ababa is a fixed +03:00 offset (no DST).
const EAT_OFFSET_MS = 3 * 3_600_000;

function startOfTodayEat(): Date {
  const eat = new Date(Date.now() + EAT_OFFSET_MS);
  eat.setUTCHours(0, 0, 0, 0);
  return new Date(eat.getTime() - EAT_OFFSET_MS);
}

function startOfMonthEat(): Date {
  const eat = new Date(Date.now() + EAT_OFFSET_MS);
  eat.setUTCDate(1);
  eat.setUTCHours(0, 0, 0, 0);
  return new Date(eat.getTime() - EAT_OFFSET_MS);
}

/** Aggregate KPIs for the school dashboard (spec §3.1.2). RLS scopes the counts. */
export function useDashboardStats(tenantId: string | null) {
  return useQuery({
    queryKey: ['dashboard-stats', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardStats> => {
      const todayStart = startOfTodayEat().toISOString();
      const todayEnd = new Date(startOfTodayEat().getTime() + 86400_000).toISOString();
      const monthStart = startOfMonthEat().toISOString();

      const [learners, lessons, instructors, reviews, payments] = await Promise.all([
        supabase
          .from('learners')
          .select('id', { count: 'exact', head: true })
          .is('archived_at', null),
        supabase
          .from('lessons')
          .select('id', { count: 'exact', head: true })
          .gte('scheduled_start', todayStart)
          .lt('scheduled_start', todayEnd),
        supabase
          .from('instructors')
          .select('id', { count: 'exact', head: true })
          .is('archived_at', null),
        supabase
          .from('public_registration_submissions')
          .select('id', { count: 'exact', head: true })
          .in('status', ['submitted', 'under_review']),
        supabase.from('payments').select('amount').eq('status', 'succeeded').gte('paid_at', monthStart),
      ]);

      if (payments.error) throw normalizeError(payments.error);
      const revenueMtd = ((payments.data ?? []) as Array<{ amount: number }>).reduce(
        (s, r) => s + Number(r.amount),
        0,
      );

      return {
        activeLearners: learners.count ?? 0,
        lessonsToday: lessons.count ?? 0,
        instructors: instructors.count ?? 0,
        pendingReviews: reviews.count ?? 0,
        revenueMtd,
      };
    },
  });
}
