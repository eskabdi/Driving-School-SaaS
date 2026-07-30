// payment-webhook (spec §2.7.2)
//
// Provider callback. Verifies the signature, dedupes the event, then settles the
// payment and recomputes the invoice in a single RPC. Public route (providers
// have no user JWT) — the signature IS the authentication, so it is checked
// before anything is read or written.
//
// ⚠️ The signature header name, HMAC algorithm, payload encoding, amount units
// and IP allowlist for each provider MUST be confirmed against live docs and a
// sandbox before go-live (spec §2.7.5). The scheme below is the structure, not
// a verified contract — a wrong assumption here means accepting forged
// payments, so treat the checklist as blocking.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  provider: z.enum(['chapa', 'telebirr']),
  event_type: z.string().min(1),
  provider_ref: z.string().min(1),
  amount: z.number().nonnegative(),
  idempotency_key: z.string().uuid().optional(),
  signature: z.string().optional(),
});

/** Constant-time compare so a bad signature leaks no timing information. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(
  serve({ schema }, async ({ body, service }) => {
    const secretName =
      body.provider === 'chapa' ? 'CHAPA_WEBHOOK_SECRET' : 'TELEBIRR_PUBLIC_KEY';
    const secret = Deno.env.get(secretName);
    if (!secret) {
      // Refuse rather than accept unverified money events.
      throw problem({
        code: 'PROVIDER_UNAVAILABLE',
        status: 502,
        detail: `${secretName} is not configured; refusing to process unverified webhooks`,
      });
    }

    const expected = await hmacSha256Hex(
      secret,
      `${body.provider_ref}:${body.amount}:${body.event_type}`,
    );
    if (!body.signature || !timingSafeEqual(body.signature, expected)) {
      throw problem({ code: 'FORBIDDEN', status: 403, detail: 'Invalid webhook signature' });
    }

    // Dedupe: the unique index makes a replayed event a no-op.
    const { error: dupErr } = await service.from('webhook_events').insert({
      provider: body.provider,
      provider_ref: body.provider_ref,
      event_type: body.event_type,
      payload: body,
    });
    if (dupErr) {
      if (dupErr.code === '23505') return { status: 'duplicate_ignored' };
      throw problem({ code: 'INTERNAL', status: 500, detail: dupErr.message });
    }

    // Locate the payment this event belongs to.
    let query = service.from('payments').select('id, status').limit(1);
    query = body.idempotency_key
      ? query.eq('idempotency_key', body.idempotency_key)
      : query.eq('provider_ref', body.provider_ref);
    const { data: payment } = await query.maybeSingle();
    if (!payment) {
      throw problem({ code: 'NOT_FOUND', status: 404, detail: 'No payment matches this event' });
    }

    if (body.event_type.includes('failed') || body.event_type.includes('cancel')) {
      await service.from('payments').update({ status: 'failed' }).eq('id', payment.id);
      return { status: 'failed', payment_id: payment.id };
    }

    const { data, error } = await service.rpc('settle_provider_payment', {
      p_payment_id: payment.id,
      p_amount: body.amount,
      p_provider_ref: body.provider_ref,
    });
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('PAYMENT_AMOUNT_MISMATCH')) {
        // High-severity: reconciliation task for the tenant's accountant.
        throw problem({ code: 'VALIDATION_FAILED', status: 409, detail: msg });
      }
      throw problem({ code: 'INTERNAL', status: 500, detail: msg });
    }

    return data;
  }),
);
