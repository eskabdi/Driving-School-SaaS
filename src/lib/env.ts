import { z } from 'zod';

/**
 * Validate SPA build-time env at boot. A missing required var is a failed boot,
 * not a silent `undefined` (spec §8.2).
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SENTRY_DSN: z.string().optional().default(''),
  VITE_APP_VERSION: z.string().optional().default('dev'),
  VITE_TURNSTILE_SITE_KEY: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  // Surface a clear message rather than an opaque undefined-access crash later.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid or missing environment variables:\n${issues}`);
}

export const env = parsed.data;
