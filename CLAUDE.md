# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multi-tenant Driving School Management SaaS: a React 18 + TypeScript SPA on
Supabase (Postgres + RLS, Auth, Storage, Edge Functions). Trilingual (English /
Amharic / Afaan Oromoo), Ethiopian + Gregorian calendars, built against
Ethiopia's Drivers' Qualification Certification License Proclamation No.
1074/2018. The two source-of-truth design docs are `docs/blueprint-v1.md`
(architecture) and `docs/build-spec-v2.md` (numbered spec sections, e.g. "spec
§7" or "blueprint §9") — code comments cite these section numbers constantly;
read the relevant section before changing behavior it references.

## Commands

```bash
pnpm dev                          # http://localhost:5173
pnpm build                        # tsc -b && vite build
pnpm typecheck                    # tsc -b --noEmit
pnpm lint                         # eslint . (supabase/functions is excluded — Deno, lint separately)
pnpm test                         # vitest run
pnpm test:watch                   # vitest
pnpm exec vitest run src/lib/eth-calendar.test.ts   # single test file
pnpm format                       # prettier --write "src/**/*.{ts,tsx,css}"
```

Always run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before
considering a change done — this is the standard verification loop used
throughout this project's history.

### Supabase (schema, seed, functions)

```bash
supabase link --project-ref <ref>
supabase db push                                    # apply supabase/migrations/*.sql
supabase db execute --file supabase/seed.sql         # idempotent bootstrap seed (plans + global license categories)
supabase gen types typescript --linked > src/lib/database.types.ts   # after ANY schema change
supabase functions deploy <name> --project-ref <ref> # Deno Edge Functions
supabase test db                                     # run supabase/tests/rls/*.sql (pgTAP, local only)
```

If the CLI/direct Postgres is unreachable (restricted network), use the
Management-API fallbacks instead of giving up:

```bash
SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=<ref> pnpm db:migrate --seed   # runs scripts/supabase-migrate.mjs over HTTPS /database/query
pnpm db:bundle                                        # -> dist-sql/full-schema.sql, paste into dashboard SQL editor
```

`scripts/supabase-migrate.mjs` records applied versions in
`supabase_migrations.schema_migrations` using the same convention as the CLI,
so a later `supabase db push` sees them as already applied and skips them.

**Edge Function deploys need an unrestricted network.** The multipart deploy
endpoint hangs/fails behind a TLS-re-terminating egress proxy, and the legacy
single-file endpoint is gone (404). Schema migrations are unaffected — they go
through `/database/query`, a plain JSON POST. See `docs/deployment.md` for the
full runbook, credential list, and rollback steps.

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm bootstrap:super-admin you@example.com
```

Refuses to run if a `super_admin` already exists (spec §2.2 — accounts are
created by invitation, signups stay disabled).

## Architecture

### Multi-tenancy is the organizing principle

Shared database, shared schema, every tenant-scoped table carries a mandatory
`tenant_id` with RLS enabled (blueprint §5). **Route guards
(`RequireAuth`/`RequireRole` in `src/components/auth/`) are UX-only — the real
security boundary is Postgres RLS plus the capability checks inside Edge
Functions.** Never treat a frontend role check as sufficient; a new mutation is
not safe until its RLS policy (or Edge Function `allowedRoles` + internal
check) exists.

The JWT carries `tenant_id` / `user_id` / `role` / `branch_id` / `user_status` /
`tenant_status`, injected by `public.custom_access_token_hook` (migration
`20260719000500_access_token_hook.sql`). Without enabling this hook in the
Supabase dashboard (Authentication → Hooks → Access Token), every RLS policy
evaluates false and the app looks "empty but logged in" — this is the first
thing to check when a freshly-provisioned environment shows no data.

RLS policies read JWT claims through STABLE SQL helper functions —
`get_tenant_id_from_jwt()`, `get_role_from_jwt()`, `tenant_is_writable()`,
`is_super_admin_from_jwt()` (`20260719000200_helper_functions.sql`),
`is_tenant_staff()` (`20260719000700_learners_rls.sql`), and
`current_learner_id()`/`current_instructor_id()` (defined alongside their
respective tables) — reuse these rather than inlining
`current_setting('request.jwt.claims', ...)` in new policies.

### Status transition guard

Nine stateful tables (`tenants`, `public_registration_submissions`,
`enrollments`, `lessons`, `invoices`, `payments`, `refunds`, `certificates`,
`id_cards`) share one `enforce_status_transition()` trigger (migration
`20260719001900_status_transitions.sql`) that checks every `UPDATE` against a
`status_transitions` whitelist table. Illegal edges raise `P0001` with the
error code embedded in the message; `src/lib/errors.ts`'s
`mapSqlStateToCode()` greps the message for a known `ERROR_CODES` entry rather
than flattening `P0001` to `INTERNAL`. The trigger only fires `BEFORE UPDATE`,
not `INSERT` — seed/test fixtures can insert rows directly in any valid status.
Adding a new legal edge means inserting a row into `status_transitions`, not
touching the trigger function.

### Feature flags

`feature_flags` (platform-wide defaults) + `feature_flag_overrides`
(per-tenant) resolved by the SQL function `feature_enabled(key, tenant_id)`
(migration `20260719002000_feature_flags.sql`). Frontend access is via
`useFeatureFlags()` / `useFeatureFlag(key)` in `src/lib/feature-flags.ts`
(`FlagKey` is the union of all flag keys — extend both the migration seed and
this type together). Used to gate provider payments, portal access, and other
incomplete/optional surfaces without a redeploy.

### Backend split: PostgREST vs. Edge Functions

Plain CRUD and RLS-safe reads go straight through `@supabase/supabase-js`
(`src/lib/supabase.ts`) from feature `api.ts` files using TanStack Query. A
mutation becomes an Edge Function (`supabase/functions/<name>/index.ts`) when
it needs to: cross tenants (service-role), enforce multi-step business rules
atomically (e.g. `lesson-complete` recomputing `enrollments.hours_completed`
capped at `hours_total + max_overrun_hours`), verify a webhook signature
(`payment-webhook`), or run as `SECURITY DEFINER` without exposing that surface
via RLS (`verify-certificate`, `settle_provider_payment` RPC). `docs/functions.md`
is the index of what's implemented vs. planned, with the auth mode per
function.

Every Edge Function is built with the shared wrapper
`supabase/functions/_shared/handler.ts`'s `serve({ schema, requireAuth,
allowedRoles }, fn)`. It handles CORS, Zod body validation, JWT claim
decoding into `AuthContext`, a `service` (service-role, bypasses RLS) and
`asUser` (caller's JWT, RLS applies) Supabase client, try/catch → RFC 7807
envelope, and structured JSON logging. New functions should not hand-roll any
of this — write the Zod schema and the `fn` body only. The frontend calls
functions through `invokeFunction<T>(name, body)` in `src/lib/functions.ts`,
which normalizes both transport errors and RFC 7807 envelopes into the same
`AppError` shape via `normalizeError()`.

### Error handling contract (spec §7)

`src/lib/errors.ts` defines the canonical `ERROR_CODES` union and
`normalizeError()`, which coerces three possible shapes (an Edge Function RFC
7807 envelope, a raw PostgREST/supabase-js error keyed by SQLSTATE, or an
arbitrary thrown value) into one `AppError`. SQLSTATE → code mapping lives in
`mapSqlStateToCode()` (`23P01` exclusion violation → `SCHED_CONFLICT`, `23505`
→ `INVOICE_ALREADY_SETTLED`, `42501` → `FORBIDDEN`, `P0001` → whichever known
code is embedded in the raised message). Adding a new `ErrorCode` touches
several places: the `ERROR_CODES` array, the `httpForCode()` switch (and
`RETRYABLE` if it should be retried), and an `errors.{code}` key in each of
`public/locales/{en,am,om}/common.json`.

### Routing & module structure

`src/app/routes.tsx` lazy-loads every feature page (`React.lazy` + a `named()`
adapter since pages are named, not default, exports) so each module ships its
own chunk (`vite.config.ts` also splits vendor chunks: react/supabase/i18n/query).
Two parallel route trees hang off `RequireAuth`: `/platform` (super-admin-only
`PlatformConsole`, entirely separate UI) and `/app` + `/app/manage/:tenantSlug`
(tenant staff/learner UI via `AppShell`, sharing the same `moduleRoutes` array).
Each feature lives in `src/features/<name>/` as `api.ts` (TanStack Query hooks)
+ `*Page.tsx` + dialogs; capability-gate UI with `roleHasCapability(role, cap)`
from `src/lib/roles.ts` — `ROLE_CAPABILITIES` there is the frontend mirror of
the DB's capability matrix (spec §6.5) and is meant to stay in lockstep with it,
not be treated as authoritative on its own.

### Auth claims vs. session

`src/lib/auth-context.tsx`'s `useAuth()` exposes both the raw Supabase
`session` and decoded `claims: AuthClaims` (tenant_id, user_id, role,
branch_id, statuses, locale) read directly from the JWT payload — this is a
convenience decode for UX, not a trust boundary. `RequireRole` uses `claims`
for route gating.

### Dates: store Gregorian, display Ethiopian

`src/lib/eth-calendar.ts` implements the Gregorian↔Ethiopian calendar
conversion (with tested leap-year and New-Year-shift edge cases in
`eth-calendar.test.ts`); the DB and all business logic use Gregorian
timestamps, and `EthDatePicker`
(`src/components/ethiopian-calendar/`) + `formatIsoAsEthiopian` are the only
places the Ethiopian calendar surfaces, for display/input.

### Migrations

Sequential timestamp-prefixed files in `supabase/migrations/`, one concern per
file (extensions/enums → helper functions → core tables → RLS policies →
access-token hook → then one file per feature module as it was built). New
tables follow the established shape: `tenant_id uuid ... on delete restrict`,
enums added to the shared enum migration, `updated_at` + `audit_row()`
triggers, and RLS policies built from the JWT helper functions. `supabase/seed.sql`
is the small idempotent platform bootstrap (billing plans + the global,
non-tenant-scoped Ethiopian license categories from Proclamation 1074/2018 —
do not add `tenant_id` to `license_categories`, it's intentionally global).
`supabase/seeds/demo_seed.sql` is a separate, staging-only fixture (one demo
tenant with users/learners/lessons/invoices across every status) — check a
table's actual columns via `information_schema.columns` before writing new
seed inserts against it; several tables have narrower columns than a first
guess suggests (e.g. `vehicles.plate_number`/`make`/`model`, not a combined
field; `lesson_assignments` has no `status` column).

### RLS test harness

`supabase/tests/rls/*.sql` are pgTAP tests, one per representative table/
pattern, run via `supabase test db` (local only — pgTAP is not installed on
hosted projects, it's meant for an ephemeral test database in CI/local dev, not
a permanent staging fixture). Each test seeds a two-tenant fixture as
superuser, then `set local role authenticated` + `set_config('request.jwt.claims',
...)` to simulate an actor and assert cross-tenant isolation, the capability
matrix, and writes blocked when `tenant_status = 'suspended'`
(`supabase/tests/rls/README.md` documents the pattern and current coverage).

## Path alias

`@/` → `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).

## Non-obvious constraints

- Signups are disabled platform-wide; every user account is created via
  `create-tenant` (school_admin) or `bootstrap-super-admin` (first super admin)
  or an invite flow — there is no self-serve signup form to wire up.
- The Vercel CSP (`vercel.json`) is strict (`script-src 'self'
  https://challenges.cloudflare.com` only) — do not add third-party script tags
  or inline scripts without updating it.
- `src/lib/env.ts` validates required `VITE_*` vars with Zod at import time and
  throws on boot if one is missing, rather than letting `undefined` leak into
  runtime code.
