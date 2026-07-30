// issue-certificate (spec §2.11): staff issues a certificate for a learner.
// Creates the certificate row with a race-safe serial and a random base32
// verification code. PDF rendering is added with the template designer; the
// verification code + serial are usable immediately.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  learnerId: z.string().uuid(),
  certificateType: z.enum([
    'course_completion',
    'hours_completion',
    'skill_mastery',
    'mock_exam_pass',
    'enrollment_confirmation',
  ]),
  enrollmentId: z.string().uuid().optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ALLOWED = ['school_admin', 'branch_manager', 'receptionist'];

// Crockford-ish base32, no ambiguous chars (spec §10: crypto.getRandomValues).
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
function verificationCode(len = 12): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    const { data: learner } = await service
      .from('learners')
      .select('id, tenant_id')
      .eq('id', body.learnerId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!learner) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Learner not found' });

    const { data: serial } = await service.rpc('next_serial', {
      p_tenant: tenantId,
      p_kind: 'certificate',
    });

    // Unique verification code (retry on the rare collision).
    let inserted: { id: string; verification_code: string } | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = verificationCode();
      const { data, error } = await service
        .from('certificates')
        .insert({
          tenant_id: tenantId,
          learner_id: body.learnerId,
          certificate_type: body.certificateType,
          verification_code: code,
          serial_number: serial,
          enrollment_id: body.enrollmentId,
          valid_until: body.validUntil,
          issued_by: auth.userId,
        })
        .select('id, verification_code')
        .single();
      if (!error) inserted = data;
      else if (error.code !== '23505') {
        throw problem({ code: 'INTERNAL', status: 500, detail: error.message });
      }
    }
    if (!inserted) throw problem({ code: 'INTERNAL', status: 500, detail: 'Code generation failed' });

    return {
      certificate_id: inserted.id,
      serial_number: serial,
      verification_code: inserted.verification_code,
    };
  }),
);
