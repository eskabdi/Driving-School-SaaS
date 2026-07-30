import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';

export type LessonStatus =
  | 'draft'
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface LessonRow {
  id: string;
  lesson_type: 'theory' | 'practical' | 'simulator';
  status: LessonStatus;
  scheduled_start: string;
  scheduled_end: string;
  instructor: { full_name: string } | null;
}

/** Upcoming lessons for the tenant, ordered by start time. */
export function useUpcomingLessons(tenantId: string | null) {
  return useQuery({
    queryKey: ['lessons', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<LessonRow[]> => {
      const { data, error } = await supabase
        .from('lessons')
        .select('id, lesson_type, status, scheduled_start, scheduled_end, instructor:instructors(full_name)')
        .gte('scheduled_start', new Date(Date.now() - 86400_000).toISOString())
        .order('scheduled_start')
        .range(0, 99);
      if (error) throw normalizeError(error);
      return (data ?? []) as unknown as LessonRow[];
    },
  });
}

export interface ScheduleLessonInput {
  instructorId: string;
  lessonType: 'theory' | 'practical' | 'simulator';
  scheduledStart: string; // ISO
  scheduledEnd: string; // ISO
  learnerId: string;
  vehicleId?: string;
}

/**
 * Schedule a lesson: insert the lesson, then its assignment. A double-booking
 * trips the DB exclusion constraint (23P01) → normalized to SCHED_CONFLICT.
 */
export function useScheduleLesson() {
  const qc = useQueryClient();
  const { claims } = useAuth();
  return useMutation({
    mutationFn: async (input: ScheduleLessonInput) => {
      const tenantId = claims?.tenant_id;
      const { data: lesson, error: lErr } = await supabase
        .from('lessons')
        .insert({
          tenant_id: tenantId,
          instructor_id: input.instructorId,
          lesson_type: input.lessonType,
          status: 'scheduled',
          scheduled_start: input.scheduledStart,
          scheduled_end: input.scheduledEnd,
          created_by: claims?.user_id,
        })
        .select('id')
        .single();
      if (lErr) throw normalizeError(lErr);

      const { error: aErr } = await supabase.from('lesson_assignments').insert({
        tenant_id: tenantId,
        lesson_id: lesson.id,
        learner_id: input.learnerId,
        vehicle_id: input.vehicleId || null,
      });
      if (aErr) {
        // Roll back the orphaned lesson so a failed assignment leaves no trace.
        await supabase.from('lessons').delete().eq('id', lesson.id);
        throw normalizeError(aErr);
      }
      return lesson.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });
}
