import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';
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

// --- End-lesson delivery ---------------------------------------------------

export interface LessonParticipant {
  learnerId: string;
  learnerName: string;
  enrollmentId: string | null;
}

/**
 * Assigned learners for a lesson, each mapped to their active enrollment (the
 * hour bank the lesson-complete RPC will charge).
 */
export function useLessonParticipants(lessonId: string | null) {
  return useQuery({
    queryKey: ['lesson-participants', lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<LessonParticipant[]> => {
      const { data: assignments, error } = await supabase
        .from('lesson_assignments')
        .select('learner_id, enrollment_id, learner:learners(full_name)')
        .eq('lesson_id', lessonId);
      if (error) throw normalizeError(error);

      const rows = (assignments ?? []) as unknown as Array<{
        learner_id: string;
        enrollment_id: string | null;
        learner: { full_name: string } | null;
      }>;

      // Fall back to the learner's most recent active enrollment when the
      // assignment didn't pin one.
      const learnerIds = rows.map((r) => r.learner_id);
      const enrollmentByLearner = new Map<string, string>();
      if (learnerIds.length > 0) {
        const { data: enr } = await supabase
          .from('enrollments')
          .select('id, learner_id, status, enrolled_at')
          .in('learner_id', learnerIds)
          .in('status', ['active', 'pending_payment'])
          .order('enrolled_at', { ascending: false });
        for (const e of (enr ?? []) as Array<{ id: string; learner_id: string }>) {
          if (!enrollmentByLearner.has(e.learner_id)) {
            enrollmentByLearner.set(e.learner_id, e.id);
          }
        }
      }

      return rows.map((r) => ({
        learnerId: r.learner_id,
        learnerName: r.learner?.full_name ?? '—',
        enrollmentId: r.enrollment_id ?? enrollmentByLearner.get(r.learner_id) ?? null,
      }));
    },
  });
}

export interface SkillRow {
  id: string;
  code: string;
  name_en: string;
  name_am: string | null;
  name_om: string | null;
  license_category_code: string;
}

export function useSkills(tenantId: string | null) {
  return useQuery({
    queryKey: ['skills', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<SkillRow[]> => {
      const { data, error } = await supabase
        .from('skills')
        .select('id, code, name_en, name_am, name_om, license_category_code')
        .order('sort_order');
      if (error) throw normalizeError(error);
      return (data ?? []) as SkillRow[];
    },
  });
}

export interface CompleteLessonInput {
  lessonId: string;
  attendance: Array<{
    learner_id: string;
    enrollment_id?: string;
    status: 'present' | 'late' | 'absent';
    hours_logged: number;
  }>;
  evaluations: Array<{
    learner_id: string;
    skill_id?: string;
    score: number;
    is_internal?: boolean;
  }>;
}

export function useCompleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompleteLessonInput) =>
      invokeFunction<{ lesson_id: string; status: string }>('lesson-complete', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      void qc.invalidateQueries({ queryKey: ['learners'] });
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
