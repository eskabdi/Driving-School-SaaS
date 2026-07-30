// lesson-complete (spec §2.5): instructor finalizes a lesson.
// Delegates to the complete_lesson RPC (single transaction) which records
// attendance + evaluations, recomputes the enrollment hour bank (capped), and
// marks the lesson completed. The RPC runs with the caller's JWT so its
// tenant/role checks apply.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const attendance = z.object({
  learner_id: z.string().uuid(),
  enrollment_id: z.string().uuid().optional(),
  status: z.enum(['present', 'late', 'absent']).default('present'),
  hours_logged: z.number().min(0).max(24).default(0),
});

const evaluation = z.object({
  learner_id: z.string().uuid(),
  skill_id: z.string().uuid().optional(),
  score: z.number().int().min(0).max(5),
  notes: z.string().optional(),
  is_internal: z.boolean().default(false),
});

const schema = z.object({
  lessonId: z.string().uuid(),
  attendance: z.array(attendance).min(1),
  evaluations: z.array(evaluation).default([]),
});

const ALLOWED = ['instructor', 'school_admin', 'branch_manager'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, asUser }) => {
    if (!asUser) throw problem({ code: 'UNAUTHENTICATED', status: 401 });

    const { data, error } = await asUser.rpc('complete_lesson', {
      p_lesson_id: body.lessonId,
      p_attendance: body.attendance,
      p_evaluations: body.evaluations,
    });

    if (error) {
      // Map raised business errors (P0001) to their catalog codes.
      const msg = error.message ?? '';
      if (msg.includes('LESSON_ALREADY_COMPLETED')) {
        throw problem({ code: 'LESSON_ALREADY_COMPLETED', status: 409 });
      }
      if (msg.includes('FORBIDDEN')) throw problem({ code: 'FORBIDDEN', status: 403 });
      if (msg.includes('LESSON_NOT_FOUND')) {
        throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Lesson not found' });
      }
      throw problem({ code: 'INTERNAL', status: 500, detail: msg });
    }

    return data;
  }),
);
