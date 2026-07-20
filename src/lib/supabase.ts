import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';

/**
 * The single Supabase client for the SPA. Auth session is persisted in
 * localStorage (Supabase default) — acceptable because the CSP is strict and
 * no third-party scripts run (spec §6.1). Never ship the service-role key here.
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
