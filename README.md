# Driving School SaaS

Multi-tenant Driving School Management System — a React 18 + TypeScript SPA on
Supabase (Postgres + RLS, Auth, Storage, Edge Functions, Realtime), with native
English / Amharic / Afaan Oromoo interfaces and Ethiopian + Gregorian calendars.

This repository is the **foundation scaffold** built from
[`Blueprint v1`](./docs/blueprint-v1.md) and
[`Build-Ready Spec v2`](./docs/build-spec-v2.md). It wires up the project
structure, tooling, i18n, auth, routing, the Ethiopian calendar, the UI shell,
and the initial database schema + RLS. Feature modules are stubbed and built out
per the spec.

## Stack

| Concern | Choice |
|---|---|
| UI | React 18, TypeScript, Vite, Tailwind CSS, shadcn-style primitives |
| Data | Supabase (`@supabase/supabase-js`), TanStack Query |
| Forms | React Hook Form + Zod |
| i18n | i18next (`en` / `am` / `om`), namespace-split, lazy-loaded |
| Calendar | Gregorian storage, Ethiopian display via `EthDatePicker` |
| Backend | Supabase Postgres + RLS, Edge Functions (Deno) |

## Getting started

```bash
pnpm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
pnpm dev                  # http://localhost:5173
```

Other scripts:

```bash
pnpm build        # typecheck + production build
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest (includes the Ethiopian calendar suite)
pnpm lint         # eslint
```

## Environment

Copy `.env.example` to `.env`. The Supabase URL and anon key are **public by
design** (safe in the browser). Server secrets (service-role key, provider keys)
live only in Supabase Vault / EF secrets and are never shipped to the client —
see [spec §8.2](./docs/build-spec-v2.md).

## Supabase

SQL lives in [`supabase/`](./supabase):

- `migrations/` — extensions & enums, JWT helpers, core tables, RLS policies,
  and the custom access-token hook.
- `seed.sql` — idempotent plans + the Ethiopian license categories from
  Drivers' Qualification Certification License Proclamation No. 1074/2018
  (7 categories; Public Transport, Truck and Fuel Tanker have sub-levels).
- `config.toml` — local dev config.

Apply to a linked project with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
supabase db execute --file supabase/seed.sql
# Regenerate typed client types after any schema change:
supabase gen types typescript --linked > src/lib/database.types.ts
```

Enable the access-token hook (Authentication → Hooks → Access token) pointing at
`public.custom_access_token_hook` so JWTs carry `tenant_id` / `role` / etc.

## Project structure

```
src/
  app/                     router, providers, root layout
  components/
    auth/                  RequireAuth, RequireRole
    ethiopian-calendar/    EthDatePicker
    layout/                AppShell, PageHeader, LanguageSwitcher
    ui/                    shadcn-style primitives
  features/                one folder per module (auth, dashboard, learners, …)
  lib/                     supabase, i18n, eth-calendar, auth-context, roles, errors
public/locales/{en,am,om}/ translation namespaces
supabase/                  migrations, seed, config
docs/                      blueprint + build spec
```

## Multi-tenancy & security

Shared database, shared schema, mandatory `tenant_id`, and RLS on every
tenant-scoped table (blueprint §5). Route guards are UX-only — the real
boundary is RLS + Edge Function checks. Every JWT carries the tenant/role
claims injected by the access-token hook.

## Status

Built in this scaffold: tooling, env validation, Supabase client, i18n (3
locales), Ethiopian calendar + tested converters, auth context + guards, app
shell + routing, UI primitives, `EthDatePicker`, core schema (tenants, users,
branches, settings, plans, subscriptions, license categories, audit logs) with
RLS and the access-token hook.

Next per the spec: user lifecycle, tenant status enforcement, serial sequences,
learners/enrollments/lessons modules, billing, templates, and the Edge Functions
in [`docs/functions.md`](./docs/functions.md).
