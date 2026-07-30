# Deployment runbook

Two targets: the **Supabase** project (schema, seed, auth hook, Edge Functions)
and the **Vercel** SPA. Order matters — schema first, then functions, then the
frontend (spec §8.1: migrations lead, code follows).

## 0. Prerequisites

| Credential | Where | Used for |
|---|---|---|
| Supabase personal access token (`sbp_…`) | https://supabase.com/dashboard/account/tokens | Management API: run SQL, deploy functions, set secrets |
| Supabase `service_role` key | Project → Settings → API | Edge Function secret (never shipped to the browser) |
| Vercel token | https://vercel.com/account/tokens | CLI/API deploys |

The **anon key and project URL are public by design** and belong in the SPA env.
The `service_role` key and the access tokens are secrets — keep them out of the
client, out of git, and rotate them after any exposure.

## 1. Apply the schema

Preferred, from a machine with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
supabase db execute --file supabase/seed.sql
```

If the CLI or a direct Postgres connection is unavailable (restricted network,
CI sandbox), use the Management API runner — it applies the same migrations over
HTTPS and records them in `supabase_migrations.schema_migrations`, so a later
`supabase db push` sees them as already applied:

```bash
SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=<ref> pnpm db:migrate --seed
# preview without applying:
SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=<ref> pnpm db:migrate --dry-run
```

Last-resort, credential-free path — generate one file and paste it into the
dashboard SQL editor:

```bash
pnpm db:bundle          # -> dist-sql/full-schema.sql
```

## 2. Enable the access-token hook

Dashboard → Authentication → Hooks → **Customize Access Token (JWT) Claims** →
select `public.custom_access_token_hook`.

Without this the JWT carries no `tenant_id` / `role`, every RLS policy evaluates
to false, and the app will look "empty but logged in". This step is not optional.

## 3. Deploy Edge Functions

The two public endpoints must skip gateway JWT verification; the other ten
authenticate inside `_shared/handler.ts`:

```bash
supabase functions deploy submit-public-registration --project-ref <ref> --no-verify-jwt
supabase functions deploy verify-certificate         --project-ref <ref> --no-verify-jwt
supabase functions deploy --project-ref <ref>        # the remaining ten
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions automatically — no `secrets set` needed for those. Use
`supabase secrets set` only for third-party keys (Chapa, Telebirr, Afromessage,
Resend, Turnstile) when those integrations are switched on.

> **Run this from an unrestricted network.** The deploy endpoint
> (`POST /v1/projects/{ref}/functions/deploy`) is a multipart upload that fails
> with `TransportError` behind a TLS-re-terminating egress proxy — the assets
> upload, then the final call dies. `--use-api` fails the same way, and the
> legacy single-file endpoint now returns 500. Schema migrations are unaffected
> (they go through `/database/query`, which is a plain JSON POST).

## 4. Configure Auth

- **Site URL** → the production Vercel URL.
- **Redirect URLs** → add the production URL (and preview domains if invites are
  accepted from previews).
- Signups stay **disabled** — accounts are created by invitation
  (`create-tenant`, `bootstrap-super-admin`), per spec §2.2.

## 5. Deploy the SPA to Vercel

`vercel.json` already pins the framework, build/install commands, SPA rewrites,
cache headers, and the CSP + security headers from spec §8.3.

**Dashboard:** import the GitHub repo, then set these environment variables
(Production + Preview):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_APP_VERSION=<git sha>
```

**CLI:**

```bash
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

The build fails fast if either variable is missing — `src/lib/env.ts` validates
them with Zod at build time rather than letting `undefined` reach runtime.

## 6. Bootstrap the first super admin

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
  pnpm bootstrap:super-admin you@example.com
```

Refuses to run if a `super_admin` already exists. The invitee sets their own
password from the email link.

## 7. Smoke test (spec §9.2)

1. `/verify` and `/r/<slug>` load without a session.
2. Sign in as the super admin → redirected to `/platform`.
3. Onboard a tenant → the invited `school_admin` receives an email.
4. As that admin: create a package → convert a registration → enroll → schedule
   a lesson → complete it → record a payment → issue a certificate → verify the
   code publicly returns `valid`.
5. Tenant isolation probe: another tenant's id in a query returns 0 rows.

## Rollback

- **Schema:** migrations are additive and forward-only. To undo, restore from a
  PITR snapshot (Settings → Database → Backups) — do not hand-edit tables.
- **Frontend:** Vercel → Deployments → promote the previous build.
- **Functions:** redeploy the previous git revision.

## After deploying

Revoke any access tokens created for a one-off deploy, and rotate the
`service_role` key if it was pasted anywhere outside a secret store
(`ops/runbooks/rotate-keys.md` is the quarterly-rotation home).
