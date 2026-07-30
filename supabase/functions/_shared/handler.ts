// Shared Edge Function wrapper (spec §7.4). No EF is written without it.
// Provides: request-id, CORS, Zod body parsing, auth extraction, capability
// gating, try/catch → RFC 7807 envelope, and a structured JSON log line.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { corsHeaders } from './cors.ts';
import { AppProblem, problem, toEnvelope } from './errors.ts';

export interface AuthContext {
  userId: string | null; // public.users.id
  authUid: string | null; // auth.users.id
  tenantId: string | null;
  role: string | null;
  branchId: string | null;
  tenantStatus: string | null;
}

export interface HandlerCtx<TBody> {
  body: TBody;
  auth: AuthContext;
  requestId: string;
  /** Service-role client — bypasses RLS. Use only for cross-tenant work. */
  service: SupabaseClient;
  /** Client scoped to the caller's JWT — RLS applies. Null for public routes. */
  asUser: SupabaseClient | null;
}

export interface HandlerOptions<TSchema extends z.ZodTypeAny> {
  schema: TSchema;
  /** When true, require a valid JWT and populate auth. */
  requireAuth?: boolean;
  /** Optional coarse capability check on top of RLS (spec §9). */
  allowedRoles?: string[];
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function decodeJwt(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
}

export function serve<TSchema extends z.ZodTypeAny>(
  opts: HandlerOptions<TSchema>,
  fn: (ctx: HandlerCtx<z.infer<TSchema>>) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'content-type': 'application/json', 'x-request-id': requestId },
      });

    try {
      if (req.method !== 'POST') {
        throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Use POST' });
      }

      // Parse + validate body.
      let raw: unknown = {};
      try {
        raw = await req.json();
      } catch {
        raw = {};
      }
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fields[issue.path.join('.') || '_'] = issue.message;
        }
        throw problem({ code: 'VALIDATION_FAILED', status: 400, fields });
      }

      // Auth extraction.
      const auth: AuthContext = {
        userId: null,
        authUid: null,
        tenantId: null,
        role: null,
        branchId: null,
        tenantStatus: null,
      };
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (token) {
        try {
          const claims = decodeJwt(token);
          auth.authUid = (claims.sub as string) ?? null;
          auth.userId = (claims.user_id as string) ?? null;
          auth.tenantId = (claims.tenant_id as string) ?? null;
          // Top-level "role" is PostgREST's DB-role-switch claim (always
          // "authenticated"); the app role rides under "user_role" instead
          // (see migration 20260719002300).
          auth.role = (claims.user_role as string) ?? null;
          auth.branchId = (claims.branch_id as string) ?? null;
          auth.tenantStatus = (claims.tenant_status as string) ?? null;
        } catch {
          // fall through to requireAuth check
        }
      }

      if (opts.requireAuth && !auth.authUid) {
        throw problem({ code: 'UNAUTHENTICATED', status: 401 });
      }
      if (opts.allowedRoles && (!auth.role || !opts.allowedRoles.includes(auth.role))) {
        throw problem({ code: 'FORBIDDEN', status: 403 });
      }

      const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false },
      });
      const asUser = token
        ? createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false },
          })
        : null;

      const result = await fn({ body: parsed.data, auth, requestId, service, asUser });

      log({ requestId, status: 200, role: auth.role, tenantId: auth.tenantId });
      return json(result ?? { ok: true });
    } catch (err) {
      const p =
        err instanceof AppProblem
          ? err
          : problem({
              code: 'INTERNAL',
              status: 500,
              detail: err instanceof Error ? err.message : 'Unknown error',
              retryable: true,
            });
      log({ requestId, status: p.status, code: p.code, detail: p.detail });
      return json(toEnvelope(p, requestId), p.status);
    }
  };
}

function log(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}
