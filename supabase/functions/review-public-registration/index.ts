// review-public-registration (spec §2.3, §5.2.2, §5.2.3 — fixes G11)
// Service role. Drives the submission state machine and, on convert, creates the
// learner and moves KYC files from the unreadable pending bucket to the
// learner's permanent bucket (copy + delete), which is impossible client-side.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  submissionId: z.string().uuid(),
  action: z.enum(['claim', 'approve', 'reject', 'convert']),
  rejectedReason: z
    .enum(['incomplete_docs', 'duplicate', 'ineligible', 'spam', 'other'])
    .optional(),
  branchId: z.string().uuid().optional(), // required on convert
});

const STAFF = ['school_admin', 'branch_manager', 'receptionist'];
const PENDING_BUCKET = 'kyc-uploads-pending';
const PERMANENT_BUCKET = 'kyc-documents';

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: STAFF }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    const { data: sub } = await service
      .from('public_registration_submissions')
      .select('*')
      .eq('id', body.submissionId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!sub) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Submission not found' });

    const nowIso = new Date().toISOString();

    switch (body.action) {
      case 'claim': {
        assertFrom(sub.status, ['submitted', 'under_review']);
        await update(service, sub.id, { status: 'under_review', reviewed_by: auth.userId });
        return { status: 'under_review' };
      }

      case 'approve': {
        assertFrom(sub.status, ['under_review']);
        await update(service, sub.id, { status: 'approved', reviewed_at: nowIso });
        return { status: 'approved' };
      }

      case 'reject': {
        assertFrom(sub.status, ['submitted', 'under_review']);
        if (!body.rejectedReason) {
          throw problem({
            code: 'VALIDATION_FAILED',
            status: 400,
            fields: { rejectedReason: 'A reason is required' },
          });
        }
        await update(service, sub.id, {
          status: 'rejected',
          reviewed_by: auth.userId,
          reviewed_at: nowIso,
          rejected_reason: body.rejectedReason,
        });
        return { status: 'rejected' };
      }

      case 'convert': {
        assertFrom(sub.status, ['approved']);
        if (!body.branchId) {
          throw problem({
            code: 'VALIDATION_FAILED',
            status: 400,
            fields: { branchId: 'A branch is required' },
          });
        }

        // Plan-limit guard before creating a learner.
        const { data: withinLimit } = await service.rpc('check_plan_limit', {
          p_tenant: tenantId,
          p_limit_key: 'max_learners',
        });
        if (withinLimit === false) throw problem({ code: 'PLAN_LIMIT_REACHED', status: 402 });

        // Idempotent: if already converted, return the existing learner.
        if (sub.created_learner_id) {
          return { status: 'converted', learner_id: sub.created_learner_id };
        }

        const { data: learner, error: lErr } = await service
          .from('learners')
          .insert({
            tenant_id: tenantId,
            branch_id: body.branchId,
            full_name: sub.full_name,
            phone: sub.phone,
            email: sub.email,
            date_of_birth: sub.date_of_birth,
            gender: sub.gender,
            license_category_applied: sub.license_category_applied,
            consent: sub.consent,
          })
          .select('id')
          .single();
        if (lErr) throw problem({ code: 'INTERNAL', status: 500, detail: lErr.message });

        // Move KYC files: copy pending → permanent, then delete pending.
        const movedPaths: string[] = [];
        for (const path of sub.kyc_storage_paths ?? []) {
          const filename = path.split('/').pop() ?? crypto.randomUUID();
          const dest = `${learner.id}/${filename}`;
          const { data: file, error: dErr } = await service.storage
            .from(PENDING_BUCKET)
            .download(path);
          if (dErr || !file) continue; // best-effort; missing file is not fatal
          const { error: uErr } = await service.storage
            .from(PERMANENT_BUCKET)
            .upload(dest, file, { upsert: true });
          if (!uErr) {
            movedPaths.push(dest);
            await service.storage.from(PENDING_BUCKET).remove([path]);
          }
        }

        await update(service, sub.id, {
          status: 'converted',
          created_learner_id: learner.id,
          reviewed_at: nowIso,
        });

        return { status: 'converted', learner_id: learner.id, moved_files: movedPaths.length };
      }
    }
  }),
);

function assertFrom(current: string, allowed: string[]) {
  if (!allowed.includes(current)) {
    throw problem({
      code: 'VALIDATION_FAILED',
      status: 409,
      detail: `Cannot transition from '${current}'`,
    });
  }
}

// deno-lint-ignore no-explicit-any
async function update(service: any, id: string, patch: Record<string, unknown>) {
  const { error } = await service
    .from('public_registration_submissions')
    .update(patch)
    .eq('id', id);
  if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });
}
