// request-refund (spec §2.7.4): accountant/school_admin requests a refund
// against a payment. Amount must not exceed the payment's refundable balance
// (also enforced by a DB trigger).

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(3).max(500),
  method: z.enum(['cash', 'bank_transfer', 'provider_reversal']),
});

const ALLOWED = ['school_admin', 'accountant'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    const { data: payment } = await service
      .from('payments')
      .select('id, invoice_id, amount, tenant_id, status')
      .eq('id', body.paymentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!payment) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Payment not found' });
    if (payment.status !== 'succeeded') {
      throw problem({ code: 'VALIDATION_FAILED', status: 400, detail: 'Payment is not refundable' });
    }

    const { data: priorRefunds } = await service
      .from('refunds')
      .select('amount, status')
      .eq('payment_id', body.paymentId);
    const reserved = (priorRefunds ?? [])
      .filter((r) => !['rejected', 'failed'].includes(r.status))
      .reduce((s, r) => s + Number(r.amount), 0);
    const refundable = Number(payment.amount) - reserved;
    if (body.amount > refundable + 0.001) {
      throw problem({
        code: 'VALIDATION_FAILED',
        status: 400,
        fields: { amount: `Exceeds refundable balance of ${refundable.toFixed(2)}` },
      });
    }

    const { data, error } = await service
      .from('refunds')
      .insert({
        tenant_id: tenantId,
        payment_id: body.paymentId,
        invoice_id: payment.invoice_id,
        amount: body.amount,
        reason: body.reason,
        method: body.method,
        status: 'requested',
        requested_by: auth.userId,
      })
      .select('id')
      .single();
    if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });

    return { refund_id: data.id, status: 'requested' };
  }),
);
