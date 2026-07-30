// issue-id-card (spec §2.11): staff issues an ID card for a learner or
// instructor. Race-safe card number via next_serial; expiry from
// tenant_settings.card_validity_months. PDF rendering lands with the designer.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  holderType: z.enum(['learner', 'instructor']),
  learnerId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
});

const ALLOWED = ['school_admin', 'branch_manager', 'receptionist'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    const holderId = body.holderType === 'learner' ? body.learnerId : body.instructorId;
    if (!holderId) {
      throw problem({
        code: 'VALIDATION_FAILED',
        status: 400,
        fields: { holder: 'A holder is required' },
      });
    }

    // Validate the holder belongs to the tenant.
    const table = body.holderType === 'learner' ? 'learners' : 'instructors';
    const { data: holder } = await service
      .from(table)
      .select('id')
      .eq('id', holderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!holder) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Holder not found' });

    const { data: settings } = await service
      .from('tenant_settings')
      .select('card_validity_months')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const months = settings?.card_validity_months ?? 12;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);

    const kind = body.holderType === 'learner' ? 'learner_card' : 'instructor_card';
    const { data: cardNumber } = await service.rpc('next_serial', {
      p_tenant: tenantId,
      p_kind: kind,
    });

    const { data: card, error } = await service
      .from('id_cards')
      .insert({
        tenant_id: tenantId,
        holder_type: body.holderType,
        learner_id: body.holderType === 'learner' ? holderId : null,
        instructor_id: body.holderType === 'instructor' ? holderId : null,
        card_number: cardNumber,
        status: 'active',
        expires_on: expires.toISOString().slice(0, 10),
        issued_by: auth.userId,
      })
      .select('id')
      .single();
    if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });

    return { card_id: card.id, card_number: cardNumber };
  }),
);
