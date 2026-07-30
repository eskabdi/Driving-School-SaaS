import { describe, it, expect } from 'vitest';
import {
  timingSafeEqual,
  hmacSha256Hex,
  canonicalWebhookMessage,
  verifyWebhookSignature,
} from './webhook-signature';

// This is the boundary that authenticates incoming money events (spec §2.7.2).
// A regression here means accepting forged payments, so pin the contract hard.

const SECRET = 'test-webhook-secret';

describe('timingSafeEqual', () => {
  it('is true only for identical strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
  });

  it('is false when lengths differ (no throw, no partial match)', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'x')).toBe(false);
  });

  it('treats two empty strings as equal', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('hmacSha256Hex', () => {
  it('produces a deterministic 64-char lowercase hex digest', async () => {
    const sig = await hmacSha256Hex(SECRET, 'payload');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacSha256Hex(SECRET, 'payload')).toBe(sig);
  });

  it('changes when the secret or the message changes', async () => {
    const base = await hmacSha256Hex(SECRET, 'payload');
    expect(await hmacSha256Hex('other-secret', 'payload')).not.toBe(base);
    expect(await hmacSha256Hex(SECRET, 'payload!')).not.toBe(base);
  });

  it('matches a known RFC 4231-style vector', async () => {
    // HMAC-SHA256(key="key", msg="The quick brown fox jumps over the lazy dog")
    expect(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });
});

describe('canonicalWebhookMessage', () => {
  it('joins provider_ref, amount and event_type in a fixed order', () => {
    expect(canonicalWebhookMessage('ref-1', 250, 'payment.succeeded')).toBe(
      'ref-1:250:payment.succeeded',
    );
  });
});

describe('verifyWebhookSignature', () => {
  const ref = 'ref-42';
  const amount = 1500;
  const event = 'payment.succeeded';

  const sign = () => hmacSha256Hex(SECRET, canonicalWebhookMessage(ref, amount, event));

  it('accepts a signature computed over the canonical message', async () => {
    expect(await verifyWebhookSignature(SECRET, ref, amount, event, await sign())).toBe(true);
  });

  it('rejects a missing signature', async () => {
    expect(await verifyWebhookSignature(SECRET, ref, amount, event, undefined)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, ref, amount, event, '')).toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const forged = await hmacSha256Hex('attacker', canonicalWebhookMessage(ref, amount, event));
    expect(await verifyWebhookSignature(SECRET, ref, amount, event, forged)).toBe(false);
  });

  it('rejects when the signed amount is tampered with', async () => {
    // Signature valid for `amount`, but the event now claims a different amount.
    const sig = await sign();
    expect(await verifyWebhookSignature(SECRET, ref, amount + 1, event, sig)).toBe(false);
  });

  it('rejects when the provider_ref or event_type is swapped', async () => {
    const sig = await sign();
    expect(await verifyWebhookSignature(SECRET, 'ref-other', amount, event, sig)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, ref, amount, 'payment.failed', sig)).toBe(false);
  });
});
