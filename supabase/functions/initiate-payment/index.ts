// initiate-payment (spec §2.7.2)
//
// Creates a payment row in `initiated`, keyed by a client-supplied idempotency
// key so a retried checkout returns the same row instead of double-charging
// (gap G9), then hands off to the configured provider and moves the row to
// `pending_provider`.
//
// Gated by the payments.online_any flag plus the per-provider flag, so a school
// running cash-only never exposes this path.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  provider: z.enum(['chapa', 'telebirr']),
  idempotencyKey: z.string().uuid(),
  returnUrl: z.string().url().optional(),
});

// Learners and sponsors pay their own invoices; staff can initiate on their behalf.
const ALLOWED = ['learner', 'parent', 'school_admin', 'accountant', 'receptionist'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: ALLOWED }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    // Flag gates.
    const { data: onlineOn } = await service.rpc('feature_enabled', {
      p_key: 'payments.online_any',
      p_tenant: tenantId,
    });
    const { data: providerOn } = await service.rpc('feature_enabled', {
      p_key: `payments.${body.provider}`,
      p_tenant: tenantId,
    });
    if (!onlineOn || !providerOn) {
      throw problem({
        code: 'FORBIDDEN',
        status: 403,
        detail: `Online payment via ${body.provider} is not enabled for this school`,
      });
    }

    // Idempotency: return the existing attempt rather than creating another.
    const { data: existing } = await service
      .from('payments')
      .select('id, status, provider_ref')
      .eq('idempotency_key', body.idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { payment_id: existing.id, status: existing.status, idempotent: true };
    }

    // Validate the invoice and the outstanding balance.
    const { data: invoice } = await service
      .from('invoices')
      .select('id, amount, status')
      .eq('id', body.invoiceId)
      .eq('tenant_id', tenantId)
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
    const balance =
      Number(invoice.amount) - (paidRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
    if (body.amount > balance + 0.001) {
      throw problem({
        code: 'VALIDATION_FAILED',
        status: 400,
        fields: { amount: `Exceeds the outstanding balance of ${balance.toFixed(2)}` },
      });
    }

    const { data: payment, error } = await service
      .from('payments')
      .insert({
        tenant_id: tenantId,
        invoice_id: body.invoiceId,
        amount: body.amount,
        method: body.provider,
        provider: body.provider,
        status: 'initiated',
        idempotency_key: body.idempotencyKey,
      })
      .select('id')
      .single();
    if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });

    // --- Provider hand-off -------------------------------------------------
    // The request/response shape, amount units (birr vs cents), and credential
    // names must be confirmed against live provider docs before go-live — see
    // the spec §2.7.5 checklist. Until the secret is present we fail loudly
    // rather than pretend a checkout exists.
    const secret = Deno.env.get(
      body.provider === 'chapa' ? 'CHAPA_SECRET_KEY' : 'TELEBIRR_APP_KEY',
    );
    if (!secret) {
      throw problem({
        code: 'PROVIDER_UNAVAILABLE',
        status: 502,
        detail: `${body.provider} is enabled but its credentials are not configured`,
        retryable: false,
      });
    }

    // Real call goes here; on success store provider_ref and move to
    // pending_provider, then return the provider's redirect URL.
    throw problem({
      code: 'PROVIDER_UNAVAILABLE',
      status: 502,
      detail: `${body.provider} integration is not implemented yet (payment ${payment.id} left in 'initiated')`,
      retryable: false,
    });
  }),
);
