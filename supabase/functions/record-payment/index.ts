// record-payment (spec §2.7.3): receptionist/accountant records a cash or
// bank-transfer payment. Issues a receipt serial, then applies the payment via
// the apply_payment RPC (recomputes invoice status, activates the enrollment).

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['cash', 'bank_transfer', 'cheque']),
  idempotencyKey: z.string().uuid(),
  reference: z.string().optional(),
});

const ALLOWED = ['school_admin', 'branch_manager', 'accountant', 'receptionist'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service, asUser }) => {
    if (!asUser || !auth.tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    // Reject overpayment: amount must not exceed the outstanding balance.
    const { data: invoice } = await service
      .from('invoices')
      .select('id, amount, status, tenant_id')
      .eq('id', body.invoiceId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();
    if (!invoice) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Invoice not found' });
    if (['paid', 'void', 'refunded'].includes(invoice.status)) {
      throw problem({ code: 'INVOICE_ALREADY_SETTLED', status: 409 });
    }

    const { data: paidRows } = await service
      .from('payments')
      .select('amount')
      .eq('invoice_id', body.invoiceId)
      .eq('status', 'succeeded');
    const alreadyPaid = (paidRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const balance = Number(invoice.amount) - alreadyPaid;
    if (body.amount > balance + 0.001) {
      throw problem({
        code: 'VALIDATION_FAILED',
        status: 400,
        fields: { amount: `Amount exceeds the outstanding balance of ${balance.toFixed(2)}` },
      });
    }

    // Receipt serial (race-safe).
    const { data: receiptNumber } = await service.rpc('next_serial', {
      p_tenant: auth.tenantId,
      p_kind: 'receipt',
    });

    // Apply via the caller's JWT so the RPC's tenant/role checks run.
    const { data, error } = await asUser.rpc('apply_payment', {
      p_invoice_id: body.invoiceId,
      p_amount: body.amount,
      p_method: body.method,
      p_idempotency_key: body.idempotencyKey,
      p_receipt_number: receiptNumber,
    });
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('FORBIDDEN')) throw problem({ code: 'FORBIDDEN', status: 403 });
      if (msg.includes('NOT_FOUND')) throw problem({ code: 'NOT_FOUND', status: 404 });
      throw problem({ code: 'INTERNAL', status: 500, detail: msg });
    }

    return { ...data, receipt_number: receiptNumber };
  }),
);
