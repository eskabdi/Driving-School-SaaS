// Payment webhook signature primitives (spec §2.7.2).
//
// Pure crypto helpers with no Deno/Node-specific dependencies — `crypto.subtle`,
// `TextEncoder` and string ops are available in both runtimes — so the same code
// runs in the Edge Function and under the Vitest suite. Keeping these here (a
// _shared module the deploy script inlines) means the signature contract that
// guards against forged payments is unit-tested, not just live-tested.

/** Constant-time compare so a bad signature leaks no timing information. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
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

/**
 * Canonical string the provider signs. Field order/format here is the single
 * definition both signing and verification depend on — one place to fix once the
 * live provider contract is confirmed (spec §2.7.5).
 */
export function canonicalWebhookMessage(
  providerRef: string,
  amount: number,
  eventType: string,
): string {
  return `${providerRef}:${amount}:${eventType}`;
}

/** Verify a provided signature against the expected HMAC in constant time. */
export async function verifyWebhookSignature(
  secret: string,
  providerRef: string,
  amount: number,
  eventType: string,
  signature: string | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmacSha256Hex(secret, canonicalWebhookMessage(providerRef, amount, eventType));
  return timingSafeEqual(signature, expected);
}
