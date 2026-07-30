// decide-refund (spec §2.7.4): approve / reject / complete a refund.
// Four-eyes: when the tenant has >= 2 finance-capable users and
// refund_four_eyes is on, the approver must differ from the requester.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  refundId: z.string().uuid(),
  decision: z.enum(['approve', 'reject', 'complete']),
  providerRef: z.string().optional(),
});

const ALLOWED = ['school_admin', 'accountant'];

const NEXT: Record<string, { from: string[]; to: string }> = {
  approve: { from: ['requested'], to: 'approved' },
  reject: { from: ['requested'], to: 'rejected' },
  complete: { from: ['approved', 'processing'], to: 'completed' },
};

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    const { data: refund } = await service
      .from('refunds')
      .select('id, status, requested_by, tenant_id')
      .eq('id', body.refundId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!refund) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Refund not found' });

    const transition = NEXT[body.decision];
    if (!transition.from.includes(refund.status)) {
      throw problem({
        code: 'VALIDATION_FAILED',
        status: 409,
        detail: `Cannot ${body.decision} a refund in '${refund.status}'`,
      });
    }

    // Four-eyes on approval.
    if (body.decision === 'approve') {
      const { data: settings } = await service
        .from('tenant_settings')
        .select('refund_four_eyes')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      const { count } = await service
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('role', ['school_admin', 'accountant'])
        .eq('status', 'active');
      const fourEyes = settings?.refund_four_eyes ?? true;
      if (fourEyes && (count ?? 0) >= 2 && refund.requested_by === auth.userId) {
        throw problem({
          code: 'FORBIDDEN',
          status: 403,
          detail: 'A different finance user must approve this refund',
        });
      }
    }

    const { error } = await service
      .from('refunds')
      .update({
        status: transition.to,
        decided_by: auth.userId,
        decided_at: new Date().toISOString(),
        provider_ref: body.providerRef ?? null,
      })
      .eq('id', body.refundId);
    if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });

    return { refund_id: refund.id, status: transition.to };
  }),
);
