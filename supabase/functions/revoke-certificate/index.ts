// revoke-certificate (spec §2.11): school_admin/accountant revokes a certificate
// with a mandatory reason. The row is kept (status=revoked) so a previously
// issued PDF can be proven invalid; public verification returns `revoked`.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  certificateId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

const ALLOWED = ['school_admin', 'accountant'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    const { data: cert } = await service
      .from('certificates')
      .select('id, status, tenant_id')
      .eq('id', body.certificateId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!cert) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Certificate not found' });
    if (cert.status === 'revoked') {
      return { certificate_id: cert.id, status: 'revoked', already: true };
    }

    const { error } = await service
      .from('certificates')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: auth.userId,
        revoked_reason: body.reason,
      })
      .eq('id', body.certificateId);
    if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });

    return { certificate_id: cert.id, status: 'revoked' };
  }),
);
