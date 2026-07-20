# Driving School SaaS — Build-Ready Specification v2.0

**Supersedes:** `driving-school-saas-blueprint-1.md` (Blueprint v1). This document is additive: everything in v1 remains valid unless explicitly amended in §0. Engineering builds from this document.
**Stack (unchanged):** React 18 + TypeScript SPA, shadcn/ui, TanStack Query, React Hook Form + Zod, Supabase (Postgres + RLS, Auth, Storage, Edge Functions, Realtime), i18next (en/am/om), Ethiopian + Gregorian calendars, Vercel hosting.
**Conventions:** ETB currency, `Africa/Addis_Ababa` timezone (no DST), Gregorian storage / calendar-aware display, camelCase TypeScript / snake_case SQL, native Supabase auth only, RLS mandatory on every tenant table.

---

## 0. Gap Audit — Amendments to Blueprint v1

Every item below is a defect or omission in v1 that this spec resolves. Each has a pointer to the section that fixes it.

| # | Gap in v1 | Severity | Fixed in |
|---|---|---|---|
| G1 | No state machines: statuses named (`enrollment.status`, `lesson.status`, `id_cards.status`…) but zero transitions, actors, or triggers defined | Critical | §2 (all workflows) |
| G2 | **RLS bug**: `lessons.instructor_id → instructors.id`, but policies compare it to `get_user_id_from_jwt()` (a `users.id`). Instructor-scoped policies match nothing. | Critical | §1.2 (adds `instructors.user_id`, corrected policies) |
| G3 | Referenced-but-undefined tables: `sponsor_links`, `lesson_assignments`, `instructor_availability`, `progress_milestones`, `notifications`, `notification_templates`, `refunds`, `invoice_items`, `installment_plans`, `mock_exam_questions/options/answers`, `skills` catalog, `user_invitations`, `print_station_devices`, `serial_sequences`, `tenant_subscriptions` | Critical | §1.3 (full DDL) |
| G4 | No refund workflow although `accountant` "manages refunds" | High | §2.7 |
| G5 | No platform billing model although `super_admin` "manages billing" | High | §2.1, §1.3.14 |
| G6 | No tenant suspension / offboarding lifecycle | High | §2.1 |
| G7 | No user lifecycle: invitation, activation, deactivation, role change, forced sign-out | High | §2.2, §3.5 |
| G8 | Lesson cancellation, no-show, late-cancel, hour-bank deduction rules undefined | High | §2.5 |
| G9 | Payment idempotency, partial payment, overpayment, reconciliation undefined | High | §2.7 |
| G10 | Template autosave has no concurrency control (two admins editing → silent overwrite) | High | §2.10 (optimistic locking via `layout_version`) |
| G11 | KYC approval says "receptionist moves files" — impossible client-side when the pending bucket is unreadable; must be a service-role Edge Function | High | §2.3 |
| G12 | No dialog/modal/wizard inventory | High | §5 |
| G13 | No feature-flag catalog; `feature_flags` table exists but nothing populates or consumes it in a defined way | Medium | §4 |
| G14 | No error-code catalog, no client error-handling standard beyond "RFC 7807" | High | §7 |
| G15 | No backup/restore procedure, RPO/RTO, or restore drill | High | §3.4 |
| G16 | No environment-variable catalog / secret inventory | Medium | §8.2 |
| G17 | No password policy, lockout, session-duration, MFA, or print-device auth spec | High | §6 |
| G18 | Double-booking exclusion constraint named in risk table but absent from schema | Medium | §1.3.6 |
| G19 | Serial numbers (`card_number`, `serial_number`, invoice no.) have formats but no generation mechanism (race-safe) | Medium | §1.3.13 |
| G20 | Verify-certificate caching says Redis, but Redis is "Phase 2+" — Phase 1 story undefined | Low | §2.12 (Postgres fallback) |
| G21 | Offline PWA queue conflict rules undefined | Medium | §2.5.6 |
| G22 | No health-endpoint contract, no alert routing (who gets paged, how) | Medium | §3.2–3.3 |
| G23 | No bootstrap/seed procedure (first super admin, license categories) | Medium | §8.4 |
| G24 | Chapa/Telebirr webhook signature schemes asserted but not verified — same class of risk flagged in the timhirt audit | High | §2.7.5 (runtime-confirmation checklist) |
| G25 | Learner/parent portal account linking flow undefined (`learners.user_id` "null until self-registers" — how?) | Medium | §2.2.4 |
| G26 | Public registration duplicate-phone rule conflicts with legitimate re-application; no expiry of stale submissions | Low | §2.3 |
| G27 | No data-retention schedule (KYC purge "policy" named, numbers absent) | Medium | §3.6 |
| G28 | `examiner` role listed but appears in no policy, workflow, or module | Low | §2.9 (given a real workflow) |
| G29 | No acceptance criteria / definition of done per module | Medium | §9 |

---

## 1. Data Model — Corrections and Completions

### 1.1 Global column & enum conventions (binding)

- Every tenant-scoped table: `tenant_id uuid not null references public.tenants(id) on delete restrict` (NOT `cascade` — see §3.4.3; tenant deletion is an explicit offboarding job, never a cascade).
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` + `tg_set_updated_at` trigger on all mutable tables.
- All money: `numeric(12,2)`, currency implied by `tenant_settings.currency` (ETB default). Never floats.
- All statuses are Postgres enums (not text+check) so invalid states are unrepresentable and PostgREST exposes them in types:

```sql
create type enrollment_status   as enum ('pending_payment','active','on_hold','completed','expired','cancelled');
create type lesson_status       as enum ('draft','scheduled','confirmed','in_progress','completed','cancelled','no_show');
create type invoice_status      as enum ('draft','issued','partially_paid','paid','overdue','void','refunded');
create type payment_status      as enum ('initiated','pending_provider','succeeded','failed','expired','reversed');
create type refund_status       as enum ('requested','approved','rejected','processing','completed','failed');
create type vehicle_status      as enum ('active','in_maintenance','out_of_service','retired');
create type card_status         as enum ('draft','active','lost','replaced','expired','revoked');
create type certificate_status  as enum ('active','revoked','expired');
create type print_job_status    as enum ('queued','rendering','ready','printing','completed','failed','cancelled');
create type submission_status   as enum ('submitted','under_review','approved','rejected','converted','expired');
create type template_status     as enum ('draft','published','archived');
create type tenant_status       as enum ('trial','active','past_due','suspended','offboarding','archived');
create type user_status         as enum ('invited','active','disabled');
create type invitation_status   as enum ('pending','accepted','expired','revoked');
create type notification_status as enum ('queued','sending','sent','delivered','failed','cancelled');
create type maintenance_status  as enum ('scheduled','in_progress','completed','overdue','cancelled');
create type exam_attempt_status as enum ('in_progress','submitted','graded','voided');
```

### 1.2 Correction of the instructor identity bug (G2)

`instructors` gains `user_id uuid unique references public.users(id)` (nullable — an instructor may exist before having a login). All instructor-facing RLS uses this mapping. Canonical helper:

```sql
create function public.current_instructor_id() returns uuid
language sql stable as $$
  select i.id from public.instructors i
  where i.user_id = (select public.get_user_id_from_jwt())
    and i.tenant_id = (select public.get_tenant_id_from_jwt())
$$;
```

Corrected policy pattern (replaces the v1 examples wholesale):

```sql
create policy "lessons_instructor_own"
on public.lessons for select
using (
  tenant_id = (select get_tenant_id_from_jwt())
  and instructor_id = (select current_instructor_id())
);
```

The same pattern applies to `learners` (add `learners.user_id` — already present in v1 §E) with `current_learner_id()`.

### 1.3 New tables (full DDL-level definition)

All tables below get: tenant RLS baseline policy, `super_admin` bypass, `created_at/updated_at`, and indexes as listed. Only structurally interesting columns are shown; standard columns per §1.1 are implied.

**1.3.1 `sponsor_links`** — parent↔learner mapping (v1 referenced it, never defined).
```sql
create table public.sponsor_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  parent_user_id uuid not null references public.users(id),
  learner_id uuid not null references public.learners(id),
  relationship text not null default 'parent',   -- parent|guardian|employer|other
  can_pay boolean not null default true,          -- may settle invoices
  can_view_evaluations boolean not null default true,
  created_by uuid not null references public.users(id),
  unique (tenant_id, parent_user_id, learner_id)
);
```

**1.3.2 `lesson_assignments`** — resolves the v1 ERD ghost. One row per (lesson, learner), plus the vehicle used.
```sql
create table public.lesson_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  learner_id uuid not null references public.learners(id),
  enrollment_id uuid not null references public.enrollments(id), -- which hour-bank is charged
  vehicle_id uuid references public.vehicles(id),                 -- null for theory
  unique (lesson_id, learner_id)
);
create index on public.lesson_assignments (tenant_id, learner_id);
create index on public.lesson_assignments (tenant_id, vehicle_id);
```

**1.3.3 `instructor_availability`** — recurring weekly pattern + dated exceptions.
```sql
create table public.instructor_availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  instructor_id uuid not null references public.instructors(id),
  kind text not null check (kind in ('weekly','exception_block','exception_open')),
  weekday int check (weekday between 0 and 6),        -- kind=weekly
  start_time time, end_time time,                     -- kind=weekly
  starts_at timestamptz, ends_at timestamptz,         -- kind=exception_*
  note text
);
```
Rule: bookable slot = weekly pattern − exception_block + exception_open, intersected with `tenant_settings.working_hours`.

**1.3.4 `skills` + `progress_milestones`** — the evaluation checklist catalog (v1 had free-text `evaluations.skill`).
```sql
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,                     -- tenant-customizable; seeded from platform defaults
  license_category_code text not null,
  code text not null,                          -- e.g. 'parallel_parking'
  name_en text not null, name_am text, name_om text,
  sort_order int not null default 0,
  required_for_completion boolean not null default true,
  min_score_to_pass int not null default 3,    -- 0–5 band
  unique (tenant_id, license_category_code, code)
);
-- evaluations.skill (text) becomes evaluations.skill_id uuid references skills(id)

create table public.progress_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  enrollment_id uuid not null references public.enrollments(id),
  milestone text not null,        -- 'theory_complete','hours_50pct','all_skills_passed','mock_exam_passed','ready_for_authority_exam'
  reached_at timestamptz not null default now(),
  source text not null,           -- 'system' | 'manual'
  recorded_by uuid references public.users(id),
  unique (enrollment_id, milestone)
);
```
Milestones are written by triggers/Edge Functions (system) or by `school_admin` override (manual, audited).

**1.3.5 Mock-exam engine tables**
```sql
create table public.mock_exam_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  license_category_code text,               -- null = applies to all
  body_en text not null, body_am text, body_om text,
  image_storage_path text,
  explanation_en text, explanation_am text, explanation_om text,
  active boolean not null default true
);
create table public.mock_exam_question_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  question_id uuid not null references public.mock_exam_questions(id) on delete cascade,
  label_en text not null, label_am text, label_om text,
  is_correct boolean not null default false,
  sort_order int not null default 0
);
create table public.mock_exam_exam_questions (   -- composition of an exam
  exam_id uuid not null references public.mock_exams(id) on delete cascade,
  question_id uuid not null references public.mock_exam_questions(id),
  points int not null default 1,
  sort_order int not null default 0,
  primary key (exam_id, question_id)
);
create table public.mock_exam_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  attempt_id uuid not null references public.mock_exam_attempts(id) on delete cascade,
  question_id uuid not null references public.mock_exam_questions(id),
  selected_option_id uuid references public.mock_exam_question_options(id),
  is_correct boolean,
  unique (attempt_id, question_id)
);
-- mock_exams gains: pass_mark_pct int not null default 74, shuffle boolean, max_attempts int, license_category_code text
-- mock_exam_attempts gains: status exam_attempt_status, started_at, submitted_at, graded_by uuid (examiner), voided_reason text
```
RLS hard rule: `learner` role can **never select `is_correct`** on options while an attempt is `in_progress` — enforce via a `mock_exam_take_view` security-barrier view exposing only id/labels, and column privileges revoking `is_correct` from the learner-facing role path. Grading happens server-side in `submit-exam-attempt`.

**1.3.6 Booking exclusion constraints (G18)** — promoted from the risk table into the schema:
```sql
alter table public.lessons add column time_range tstzrange
  generated always as (tstzrange(scheduled_start, scheduled_end, '[)')) stored;
create extension if not exists btree_gist;
alter table public.lessons add constraint no_instructor_overlap
  exclude using gist (tenant_id with =, instructor_id with =, time_range with &&)
  where (status in ('scheduled','confirmed','in_progress'));
alter table public.lesson_assignments … -- vehicle overlap enforced via trigger that
-- materializes (vehicle_id, time_range) into lesson_vehicle_blocks with the same EXCLUDE pattern,
-- and a learner-overlap trigger raising 'LEARNER_DOUBLE_BOOKED'.
```
Client behavior on violation: catch Postgres `exclusion_violation` (SQLSTATE 23P01) → error code `SCHED_CONFLICT` → conflict dialog (§5.3.2).

**1.3.7 `refunds`** (G4)
```sql
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_id uuid not null references public.payments(id),
  invoice_id uuid not null references public.invoices(id),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  method text not null,                -- 'cash','bank_transfer','provider_reversal'
  status refund_status not null default 'requested',
  requested_by uuid not null references public.users(id),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  provider_ref text,
  check_amount_le_payment boolean generated always as (true) stored -- enforced by trigger vs. remaining refundable balance
);
```

**1.3.8 `invoice_items` + `installment_plans`**
```sql
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null,       -- 'package','extra_hours','exam_fee','id_card_replacement','certificate_reissue','penalty','discount','other'
  description text not null,
  qty numeric(8,2) not null default 1,
  unit_price numeric(12,2) not null,
  total numeric(12,2) generated always as (qty * unit_price) stored
);
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  enrollment_id uuid not null references public.enrollments(id),
  total_amount numeric(12,2) not null,
  n_installments int not null check (n_installments between 2 and 12),
  schedule jsonb not null    -- [{seq, due_date, amount, invoice_id}]
);
```
Invoice numbering: `INV-{EC-year}-{seq}` per tenant via §1.3.13. `invoices` gains `number text`, `due_date date`, `issued_at`, `void_reason`.

**1.3.9 Notifications**
```sql
create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,                          -- null = platform default, tenant row overrides
  key text not null,                       -- 'lesson_reminder_24h','payment_receipt','invite',…
  channel text not null check (channel in ('sms','email','in_app','push')),
  locale text not null check (locale in ('en','am','om')),
  subject text, body text not null,        -- {{token}} substitution, same token engine as templates
  unique (coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), key, channel, locale)
);
create table public.notifications (        -- the outbox
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  recipient_user_id uuid references public.users(id),
  recipient_phone text, recipient_email text,
  channel text not null, template_key text not null, locale text not null,
  payload jsonb not null default '{}',
  status notification_status not null default 'queued',
  scheduled_for timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  provider_ref text,
  dedupe_key text                          -- e.g. 'lesson_reminder_24h:{lesson_id}:{user_id}'
);
create unique index on public.notifications (dedupe_key) where dedupe_key is not null;
```
Delivery worker: `process-notification-outbox` cron Edge Function every minute; max 5 attempts, backoff 1m/5m/15m/1h/6h; then `failed` + alert if failure rate > 10% in 15 min.

**1.3.10 `user_invitations`** (G7)
```sql
create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  email text not null,
  role text not null,
  branch_id uuid references public.branches(id),
  invited_by uuid not null references public.users(id),
  status invitation_status not null default 'pending',
  token_hash text not null,               -- sha256 of the one-time token; raw token only in the email
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_user_id uuid references public.users(id)
);
```

**1.3.11 `print_station_devices`** (replaces the v1 `tenant_settings.print_station_device_ids` array — devices need lifecycle and revocation)
```sql
create table public.print_station_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid references public.branches(id),
  name text not null,
  device_token_hash text not null,        -- sha256; raw shown once at registration
  registered_by uuid not null references public.users(id),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
```

**1.3.12 `vehicle_maintenance_logs`** (v1 named it, never defined)
```sql
create table public.vehicle_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vehicle_id uuid not null references public.vehicles(id),
  kind text not null,                     -- 'service','repair','insurance_renewal','fitness_inspection','fuel'
  status maintenance_status not null default 'scheduled',
  due_date date, due_odometer_km int,
  completed_at timestamptz, completed_by uuid,
  cost numeric(12,2), odometer_km int, notes text,
  next_due_date date, next_due_odometer_km int
);
-- vehicles gains: insurance_expiry date, fitness_expiry date, year int, make text, model text, color text, photo_storage_path text
```

**1.3.13 `serial_sequences`** (G19) — race-safe per-tenant serials:
```sql
create table public.serial_sequences (
  tenant_id uuid not null,
  kind text not null,                    -- 'learner_card','instructor_card','certificate','invoice','receipt','tracking'
  ec_year int not null,                  -- resets yearly on the Ethiopian year
  next_value bigint not null default 1,
  primary key (tenant_id, kind, ec_year)
);
create function public.next_serial(p_tenant uuid, p_kind text) returns text … 
-- SECURITY DEFINER; INSERT … ON CONFLICT DO UPDATE SET next_value = next_value + 1 RETURNING;
-- formats: card 'L-{ECYYYY}-{000000}', cert 'C-{ECYYYY}-{000000}', invoice 'INV-{ECYYYY}-{000000}'
```
Only callable from Edge Functions / SECURITY DEFINER RPCs; never from the client.

**1.3.14 Platform billing (G5)**
```sql
create table public.plans (              -- platform-level, no tenant_id
  id uuid primary key default gen_random_uuid(),
  code text unique not null,             -- 'starter','standard','pro'
  name text not null,
  monthly_price_etb numeric(12,2) not null,
  limits jsonb not null                  -- {max_learners, max_branches, max_instructors, sms_credits, storage_gb, features:[…]}
);
create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  plan_id uuid not null references public.plans(id),
  status text not null check (status in ('trialing','active','past_due','cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false
);
-- tenants gains: status tenant_status not null default 'trial', suspended_reason text, offboard_requested_at timestamptz
```
Enforcement: `check_plan_limit(p_tenant, 'max_learners')` SECURITY DEFINER function called by `enroll-learner` and learner-create paths → error `PLAN_LIMIT_REACHED`. Payment collection for platform billing is manual (super admin marks paid) in Phases 1–3; provider-automated later.

### 1.4 Column additions to existing v1 tables (delta list)

| Table | Add |
|---|---|
| `users` | `status user_status not null default 'active'`, `branch_id uuid`, `full_name text`, `phone text`, `disabled_at timestamptz`, `disabled_by uuid`, `last_sign_in_at` (mirrored from auth) |
| `learners` | `user_id` (already in §E migration — keep), `photo_storage_path text`, `date_of_birth date`, `gender text`, `address jsonb` (region/zone/woreda/kebele), `emergency_contact jsonb`, `full_name_am text`, `full_name_om text` |
| `instructors` | `user_id uuid unique`, `status text default 'active'`, `photo_storage_path`, `hire_date date`, `license_expiry date` |
| `enrollments` | `expires_at date`, `hours_total int` (denormalized from package at enroll time — package price/hours changes must not mutate past enrollments), `price_at_enrollment numeric(12,2)`, `completed_at`, `cancelled_reason text` |
| `lessons` | `time_range` (§1.3.6), `cancelled_reason text`, `cancelled_by uuid`, `created_by uuid`, `capacity int default 1` (group theory), `notes text` |
| `lesson_attendance` | `status text check (present/absent/late)`, `marked_by uuid` |
| `payments` | `status payment_status`, `idempotency_key text unique`, `received_by uuid` (cash), `paid_at timestamptz`, `receipt_number text`, `receipt_storage_path text` |
| `invoices` | `number text`, `due_date date`, `issued_at`, `void_reason`, `installment_plan_id uuid` |
| `certificates` | `issued_by uuid not null`, `revoked_by uuid`, `revoked_reason text`, `layout_version_used int`, `template_version_id uuid` |
| `id_cards` | `issued_by uuid`, `replaced_by_card_id uuid`, `replacement_fee_invoice_id uuid`, `template_version_id uuid` |
| `id_card_templates` / `certificate_templates` | `status template_status not null default 'draft'` (replaces bare `active` boolean; `active` kept as generated column for backwards compat), `locked_by uuid`, `locked_at timestamptz` (edit lease, §2.10) |
| `public_registration_submissions` | `tracking_code text unique`, `expires_at timestamptz default now() + interval '30 days'`, `rejected_reason text`, `duplicate_of uuid` |
| `mock_exam_attempts` | see §1.3.5 |
| `audit_logs` | `ip inet`, `user_agent text`, `request_id text` |

---

## 2. End-to-End Process Workflows

Notation used throughout: **States** are enum values from §1.1. **Transitions** are written `FROM → TO — Actor — Trigger — Side effects`. Every transition that mutates a status is audited (§3.3). Any transition not listed is **forbidden and must be rejected server-side** (DB trigger `enforce_status_transition(table, from, to)` driven by a `status_transitions` reference table — the same guard table serves all workflows and is seeded from the matrices below).

### 2.1 Tenant lifecycle (platform level)

**States:** `trial → active → past_due → suspended → offboarding → archived` (plus `trial → archived` for abandoned trials).

| Transition | Actor | Trigger | Side effects |
|---|---|---|---|
| ∅ → `trial` | super_admin | Tenant Onboarding Wizard (§5.1.1) completes | `create-tenant` EF: tenant row, `tenant_settings` defaults, subscription (`trialing`, 30 days), seeds license categories + default skills + default notification templates + one starter ID-card and certificate template, creates first `school_admin` via `auth.admin.createUser`, sends invite email |
| `trial` → `active` | super_admin | Marks first subscription payment received | subscription → `active`; welcome notification |
| `trial` → `archived` | cron `expire-trials` | trial_ends_at + 14-day grace passed, no payment | tenant data retained 90 days then §3.4.3 purge |
| `active` → `past_due` | cron `billing-check` (daily) | `current_period_end` + 7 days, unpaid | banner in tenant UI ("payment overdue"), email to school_admin; **no feature loss yet** |
| `past_due` → `active` | super_admin | payment recorded | banner clears |
| `past_due` → `suspended` | super_admin (manual, deliberate) | 30 days past due, or ToS violation | JWT hook starts issuing `tenant_status:'suspended'`; RLS helper `tenant_is_writable()` returns false → **all writes blocked, reads allowed**; every session sees a full-screen suspension notice; public registration form for the tenant returns 503-style friendly page; crons skip the tenant |
| `suspended` → `active` | super_admin | resolution | full restore, notification |
| `suspended`/`active` → `offboarding` | super_admin | school requests exit, confirmed via Danger dialog (§5.1.3) | `export-tenant-archive` EF produces a full JSON+files ZIP for the school; 30-day countdown starts |
| `offboarding` → `archived` | cron | countdown elapsed | storage objects deleted, rows anonymized per §3.6, `tenants` row kept as tombstone |

Write-block enforcement is central: one predicate `public.tenant_is_writable()` (checks `tenants.status in ('trial','active','past_due')`) is `AND`-ed into every `with check` clause of every tenant RLS write policy. This is a single migration-time macro, not per-policy handwork.

### 2.2 User & identity lifecycle

**2.2.1 Staff invitation** (`school_admin` invites `instructor`/`receptionist`/`accountant`/`branch_manager`/`examiner`):
`pending → accepted | expired | revoked`

| Transition | Actor | Trigger | Side effects |
|---|---|---|---|
| ∅ → `pending` | school_admin | Invite User dialog (§5.5.1) | row in `user_invitations`; email with one-time link `https://app…/accept-invite?token=…`; token hashed at rest; duplicate pending invite for same email+tenant → error `INVITE_EXISTS` with "Resend" affordance |
| `pending` → `accepted` | invitee | `accept-invite` EF: verifies token hash + expiry, `auth.admin.createUser` (or links existing auth user if email matches), inserts `public.users` (status `active`), forces password set | audit; welcome notification |
| `pending` → `expired` | cron daily | `expires_at` passed | inviter notified after 3 expired invites/week (config) |
| `pending` → `revoked` | school_admin | Revoke action in Users list | token invalid immediately |

**2.2.2 User status:** `invited → active ↔ disabled`. Disabling (Users list → Disable dialog §5.5.2): sets `users.status='disabled'`, calls `auth.admin.signOut(userId, 'global')` to kill refresh tokens, JWT hook thereafter refuses to mint claims (`user_disabled` error at token refresh). RLS additionally checks `get_user_status_from_jwt() = 'active'` as belt-and-braces. Re-enable is the inverse. A school_admin **cannot disable themself** and cannot disable the last active school_admin of the tenant (DB trigger `LAST_ADMIN_GUARD`).

**2.2.3 Role change:** dialog §5.5.3. Effect is at next token refresh (≤ 60 min); the dialog says so and offers "Force re-login now" (global sign-out). Role changes are always audited with before/after. Changing someone **to** `school_admin` requires typing the tenant slug to confirm. `super_admin` can never be granted from tenant UI.

**2.2.4 Learner/parent portal linking (G25):** Receptionist opens learner → "Invite to portal": creates a `user_invitations` row with role `learner` and `learner_hint_id`; on acceptance the EF sets `learners.user_id`. Parents identically via role `parent` + immediate `sponsor_links` insert. If the email already belongs to a user **in the same tenant**, link directly with a confirmation dialog; cross-tenant emails create a distinct auth user (v1 model is single-tenant-per-user; multi-tenant membership is out of scope and the invite screen must state this).

**2.2.5 Password reset / forgot:** standard Supabase reset email; rate-limited 3/hour/email. Staff-initiated "Send reset" button on the user row (audited). No admin ever sees or sets a password directly.

### 2.3 Public registration → learner conversion

**States:** `submitted → under_review → approved | rejected`; `approved → converted`; any pre-converted state → `expired` (30 days).

| Transition | Actor | Trigger | Side effects |
|---|---|---|---|
| ∅ → `submitted` | anonymous visitor | Public form (§5.2.1) passes Turnstile + rate limits | `submit-public-registration` EF stores row + KYC files in `kyc-uploads-pending/`, generates `tracking_code` (`next_serial 'tracking'`, format `R-XXXXXX`), returns only the tracking code; SMS/email confirmation with the code if contact given; in-app notification to receptionists |
| `submitted` → `under_review` | receptionist | Opens the submission in the Review queue | assigns `reviewed_by` (soft claim; another receptionist opening it sees "being reviewed by X" banner, can take over) |
| `under_review` → `approved` | receptionist | Approve in Review dialog (§5.2.2) | *nothing else yet* — approval ≠ conversion; allows phone-call verification first |
| `under_review` → `rejected` | receptionist | Reject with mandatory reason category (`incomplete_docs`,`duplicate`,`ineligible`,`spam`,`other`) | optional templated SMS to applicant (never includes reason `spam`); KYC files scheduled for purge in 30 days |
| `approved` → `converted` | receptionist | Convert wizard (§5.2.3) | `review-public-registration` EF **(service role — fixes G11)**: creates `learners` row, **moves** KYC objects `kyc-uploads-pending/{sub}/` → `kyc-documents/{learner}/` (copy+delete, verifying checksums), optionally creates enrollment + first invoice in the same transaction-like sequence with compensation on failure (if enrollment insert fails, learner row is kept and the wizard resumes at step 2), stamps `created_learner_id` |
| any → `expired` | cron `expire-submissions` daily | `expires_at` passed | files purged; applicant may re-apply (this also resolves G26: the "one active submission per phone" check only counts non-terminal states) |

Duplicate handling (G26): if the phone matches an existing **learner**, the review UI shows a "Possible duplicate of {learner}" panel with a "Mark duplicate & reject" one-click that sets `duplicate_of`.

### 2.4 Enrollment lifecycle

**States:** `pending_payment → active → completed`; branches: `active ↔ on_hold`, `active → expired`, `pending_payment|active|on_hold → cancelled`.

| Transition | Actor | Trigger | Side effects |
|---|---|---|---|
| ∅ → `pending_payment` | receptionist/school_admin (or Convert wizard) | Enroll dialog (§5.3.1): pick package → EF `enroll-learner` | plan-limit check (§1.3.14); snapshot `hours_total` + `price_at_enrollment`; create invoice(s) — full or installment plan; `expires_at = enrolled_at + package.validity_days` |
| `pending_payment` → `active` | system | first payment `succeeded` covering ≥ `tenant_settings.min_activation_pct` (default 25%) of invoice total | milestone `enrolled`; learner + sponsor notified; lessons become bookable |
| `active` → `on_hold` | school_admin | Hold dialog (reason req.) — e.g. medical leave | future `scheduled` lessons for this enrollment auto-cancel with reason `enrollment_hold` (no penalty); `expires_at` extended by hold duration on resume (config toggle `extend_expiry_on_hold`, default on) |
| `on_hold` → `active` | school_admin | Resume | — |
| `active` → `completed` | system | all `required_for_completion` skills passed AND `hours_completed ≥ hours_total` AND (config `require_mock_exam_pass` off OR passed) | milestone `completed`; certificate issuance offered (§2.11); congratulation notification |
| `active` → `expired` | cron `expire-enrollments` | `expires_at` passed, not completed | notification 14/7/1 days before (dedupe-keyed); school_admin can extend (dialog, audited, optional extension fee invoice item) |
| → `cancelled` | school_admin | Cancel dialog with refund decision | outstanding invoice → `void`; if payments exist, opens Refund flow (§2.7.4) pre-filled; future lessons cancelled |

**Hour bank rule (binding):** `hours_completed` is **never** client-written. It is recomputed by the `lesson-complete` EF as `sum(lesson_attendance.hours_logged)` for the enrollment, capped at `hours_total + tenant_settings.max_overrun_hours` (default 2; beyond that the EF refuses with `HOUR_BANK_EXHAUSTED` and the UI proposes an extra-hours invoice item).

### 2.5 Lesson lifecycle

**States:** `draft → scheduled → confirmed → in_progress → completed`; exits: `scheduled|confirmed → cancelled | no_show`.

| Transition | Actor | Trigger | Side effects |
|---|---|---|---|
| ∅ → `draft` | receptionist/school_admin/instructor(self, if `tenant_settings.instructors_self_schedule`) | Schedule dialog (§5.3.2) | availability + exclusion checks run at insert; `draft` only exists inside the multi-slot wizard (bulk create) — single bookings insert directly as `scheduled` |
| `draft` → `scheduled` | same | wizard confirm | notifications: instructor + each assigned learner (24h/2h reminders enqueued with dedupe keys) |
| `scheduled` → `confirmed` | learner (portal) or receptionist | "Confirm attendance" ≤ 48h before | reminder copy switches tone |
| `scheduled|confirmed` → `in_progress` | instructor | "Start lesson" on instructor dashboard, allowed from 15 min before `scheduled_start` | `actual_start` = now; realtime broadcast |
| `in_progress` → `completed` | instructor | End-lesson wizard (§5.3.4): hours, attendance per learner, per-skill evaluations, notes | EF `lesson-complete` (RPC `complete_lesson`, single transaction): attendance rows, evaluations, recompute hour banks, milestone checks, odometer prompt if vehicle attached |
| `scheduled|confirmed` → `cancelled` | receptionist/school_admin/instructor/learner | Cancel dialog (§5.3.3) with reason | **Penalty rule:** if cancelled by learner within `tenant_settings.late_cancel_hours` (default 24h) → hours are deducted anyway per `tenant_settings.late_cancel_policy` (`deduct_full`\|`deduct_half`\|`no_penalty`, default `deduct_half`) via a synthetic attendance row flagged `penalty:true`; cancellations by school never penalize; notifications to all parties |
| `scheduled|confirmed` → `no_show` | instructor | "Mark no-show" available from `scheduled_start`+15 min | penalty per `no_show_policy` (default `deduct_full`); learner + sponsor notified; 3 no-shows in 30 days → flag on learner profile + school_admin notification |

**2.5.1 Rescheduling** is modeled as cancel(reason `rescheduled`, never penalized) + new lesson, linked via `lessons.rescheduled_from uuid`; the Reschedule dialog does both atomically through EF `reschedule-lesson`.

**2.5.2 Group theory lessons:** `capacity > 1`; assignments up to capacity; attendance marked per learner in the end-lesson wizard; hour bank charged only for `present`/`late`.

**2.5.3 Vehicle attachment rules:** practical lessons require a vehicle whose `transmission` matches the package requirement (config per package `required_transmission: manual|automatic|any`) and whose `status='active'` and `insurance_expiry`/`fitness_expiry` > lesson date — violations are hard EF errors (`VEHICLE_DOC_EXPIRED`), not warnings.

**2.5.4 Instructor certification guard:** the lesson's license category must be in `instructor_license_categories` — enforced in the scheduling EF and by a DB trigger.

**2.5.5 Auto-transition sweep:** cron `lesson-sweep` (every 15 min): `scheduled|confirmed` lessons whose `scheduled_end + 2h` passed with no instructor action → status stays but a `stale_lesson` task appears in the school_admin Action Center (§3.1.2); never auto-complete (hours must be human-attested).

**2.5.6 Offline attendance (PWA, Phase 3) conflict rules (G21):** the IndexedDB queue replays `lesson-complete` calls with the original `idempotency_key`; server keeps first-write-wins per lesson; a replay against an already-completed lesson returns `409 LESSON_ALREADY_COMPLETED` + the server copy, and the client shows a diff dialog (§5.3.5) letting the instructor file corrections as an amendment (audited), not an overwrite.

### 2.6 Vehicle & maintenance workflow

**Vehicle states:** `active ↔ in_maintenance → active`; `active|in_maintenance → out_of_service → active|retired`.

- `active → in_maintenance` — receptionist/school_admin — "Send to maintenance" dialog; **blocking check:** future practical lessons using this vehicle are listed; user must reassign or cancel them (bulk-reassign helper picks alternative vehicles with matching transmission + free slot) before confirm.
- `in_maintenance → active` — same — "Return to service": requires the linked `vehicle_maintenance_logs` row → `completed` with cost + odometer.
- `retired` is terminal; plate number is freed for reuse (unique index is partial: `where status <> 'retired'`).

**Maintenance log states:** `scheduled → in_progress → completed`; `scheduled → overdue` (cron, when `due_date` passed or odometer exceeded by config threshold) → notification to school_admin + banner on vehicle; `→ cancelled`.
Cron `vehicle-doc-check` daily: insurance/fitness expiring in 30/14/7/1 days → notifications (dedupe-keyed); expired → vehicle auto-flag `out_of_service` if `tenant_settings.auto_ground_on_expired_docs` (default **on** — statutory).

### 2.7 Billing: invoices, payments, refunds

**2.7.1 Invoice states:** `draft → issued → partially_paid → paid`; `issued|partially_paid → overdue` (cron, past `due_date`; reversible on payment); `draft|issued → void`; `paid → refunded` (full refunds only; partial refunds keep `paid` with a refund child).

**2.7.2 Payment states (provider path):** `initiated → pending_provider → succeeded | failed | expired`; `succeeded → reversed` (provider-side reversal via webhook).
- `initiate-payment` EF: creates the `payments` row `initiated` with a client-supplied `idempotency_key` (uuid per checkout attempt — **retry uses the same key**; the EF returns the existing row for a known key: G9), requests the provider checkout, stores `provider_ref`, → `pending_provider`, returns redirect URL.
- `payment-webhook` EF: verifies signature (§2.7.5), matches `provider_ref`, is idempotent (unique index on `(provider, provider_ref, event_type)` in a `webhook_events` dedupe table), transitions payment, recomputes invoice status **in the same RPC** (`apply_payment`), enqueues receipt generation + notification. Amount mismatch (provider amount ≠ payment amount) → payment `failed`, alert severity high, manual reconciliation task.
- `pending_provider → expired`: cron after 2h; user can retry (new payment row, new idempotency key).

**2.7.3 Cash / bank-transfer path:** receptionist records via Record Payment dialog (§5.4.2) → payment inserted directly `succeeded` with `received_by`; receipt PDF auto-generated; daily **cash reconciliation**: accountant's "Day close" screen lists cash payments per receptionist per day, accountant marks reconciled (field `reconciled_at`,`reconciled_by`); unreconciled > 48h → accountant alert.

**2.7.4 Refund workflow (G4):** `requested → approved → processing → completed`; `requested → rejected`; `processing → failed → processing` (retry).
- Request: accountant/school_admin from a payment row (dialog §5.4.3; amount ≤ refundable balance = payment.amount − prior completed refunds, enforced by trigger).
- Approve: **must be a different user** than requester when tenant has ≥ 2 finance-capable users (`tenant_settings.refund_four_eyes`, default on) — else school_admin self-approve allowed with an extra confirmation.
- Processing: cash/bank refunds are marked completed manually with reference; provider reversals call the provider API where supported, else instruct manual transfer.
- Every state change audited; invoice status recomputed.

**2.7.5 Provider integration verification checklist (G24 — must be confirmed against live docs/sandbox before go-live; do not trust this spec or v1 for these):**
- [ ] Chapa webhook signature header name + HMAC algorithm and secret source
- [ ] Telebirr callback encryption/signature scheme and IP allowlist
- [ ] Both providers' amount units (cents vs birr) and currency field
- [ ] Sandbox → production credential switch procedure
- [ ] Provider-side idempotency behavior on duplicate initiations

### 2.8 Evaluation & progress workflow

- Evaluations are created only inside the end-lesson wizard (instructor) or the mock-exam grading flow (examiner). Standalone evaluation creation is disabled to keep every score tied to an attested event.
- Score band 0–5; `skills.min_score_to_pass` decides pass. A skill is "passed" when the learner's **latest** score ≥ threshold (not average — driving competence is current-state).
- Learner self-evaluation (Phase 3): separate table `self_evaluations`, visible to the instructor, never counted toward completion.
- Milestone engine: after each `lesson-complete` and `submit-exam-attempt`, RPC `refresh_milestones(enrollment_id)` inserts any newly-satisfied milestones idempotently (unique constraint absorbs races).
- Instructor feedback visibility: learners and sponsors see scores + notes unless the note is flagged `internal` (checkbox per note in the wizard).

### 2.9 Mock exam workflow (and the `examiner` role — G28)

**Attempt states:** `in_progress → submitted → graded`; `→ voided` (examiner/school_admin, reason required — e.g. cheating, technical fault; voided attempts don't count toward `max_attempts`... unless void reason is `cheating`, which does).

- Start: learner (portal) or receptionist (on-site kiosk mode) → EF `start-exam-attempt`: checks `max_attempts`, snapshots the question set (shuffled if configured) into `mock_exam_answers` skeleton rows so later question-bank edits can't alter a live attempt.
- Timer: `duration_minutes` enforced server-side — `submit-exam-attempt` accepts submissions up to `started_at + duration + 2 min grace`; later → auto-submit with answered questions only (cron `exam-sweep` every minute closes overdue attempts).
- Grading: objective questions auto-grade at submit (`submitted → graded` immediate). The `examiner` role exists for: voiding attempts, manual practical mock-exam scoring (a `practical_mock` exam kind whose "questions" are skill line-items scored 0–5 on a tablet), and sign-off that a learner is `ready_for_authority_exam` (writes that milestone).
- Anti-leak: §1.3.5 view rules; question bodies watermarked with attempt id in kiosk mode print/screenshot deterrence (best effort).

### 2.10 Template designer workflow (concurrency fix G10)

**Template states:** `draft → published → archived`; `published → draft` is forbidden — editing a published template happens on a **new draft version** cloned from it ("Edit published" button = clone-to-draft + open editor), so the published layout is immutable while in force. Publishing a draft archives the previously published template of the same type.

- **Edit lease:** opening the editor sets `locked_by/locked_at` (5-min lease, heartbeat every 60s). A second admin gets a read-only banner "Being edited by {name} — Take over?" Take-over requires the first session's heartbeat to be stale (> 2 min) or a confirmation that force-disconnects it (realtime message → their editor drops to read-only).
- **Optimistic version check:** every autosave sends `layout_version`; mismatch → `409 TEMPLATE_VERSION_CONFLICT` → conflict dialog (§5.6.3): "Reload their version / Save mine as a new draft copy".
- **Publish gate (from v1 risk table, now binding):** the `template-publish` EF re-validates the layout with `LayoutDocSchema`, resolves every token against the token catalog **and** the sample record, refuses on unknown/unresolvable tokens (`TEMPLATE_TOKEN_UNRESOLVED` listing the offenders), refuses ID-card templates that don't have exactly 2 pages, refuses elements out of page bounds beyond 1 pt tolerance.
- Version history & restore per v1; restore creates a **new** version (history is append-only).

### 2.11 ID card & certificate issuance

**ID card states:** `draft → active → expired`; `active → lost → replaced`; `active|lost → revoked` (staff-issued cards on staff exit).
- Issue: receptionist from learner/instructor profile → Issue Card dialog (§5.6.4): photo check (must exist; inline capture/upload if missing), template = current published, `next_serial`, EF `generate-id-card` renders front+back, stores PDFs + `template_version_id`, status `active`, `expires_on = issued_on + tenant_settings.card_validity_months` (default 12).
- Lost/replace: Report Lost dialog → status `lost` (verification of a lost card via QR shows "reported lost"); "Issue replacement" creates the new card (`replaced_by_card_id` on old, old → `replaced`) and, if `tenant_settings.card_replacement_fee > 0`, an invoice item — replacement PDF renders only after that invoice is paid (config `require_fee_before_replacement`, default on).
- Expiry: cron flags `expired`; batch "renew expiring cards" action in Print Station.

**Certificate states:** `active → revoked`; `active → expired` (only for types with `valid_until`).
- Issue paths: (a) enrollment `completed` → Action Center suggestion → Issue Certificate dialog; (b) mock-exam pass; (c) manual by school_admin (type `enrollment_confirmation` any time). EF `issue-certificate`: serial + verification code (§2.12), render, store, notify learner with a download link (signed URL via an authenticated redirect EF — links in SMS are short app URLs requiring login, never raw signed URLs).
- Revoke: school_admin/accountant, mandatory reason, Danger dialog; PDF stays in storage (evidence) but any authenticated download is watermarked "REVOKED" by an on-the-fly re-render; public verification returns `revoked`.
- Reissue (typo fixes): revoke(reason `superseded`) + issue new; both linked via `certificates.supersedes_id`.

### 2.12 Public certificate verification

- Endpoint `verify-certificate?code=…`: normalizes (strip dashes/case), constant-time lookup, response `{status: valid|expired|revoked|not_found, holder_initial, license_category, school_name, issued_on}` — `not_found` and `revoked` responses are **identically timed** (both do a full hash compare against a dummy) to prevent oracle timing.
- Rate limit: 30/min/IP. **Phase 1 (G20):** limiter + 60s response cache implemented in Postgres (`unlogged` table `rate_limit_buckets`, cron-pruned). Phase 2 may move to Upstash Redis unchanged behind the same `RateLimiter` interface.
- Optional public page (`/verify` on the marketing domain): input + Turnstile after 5 checks/session.

### 2.13 Print job lifecycle

`queued → rendering → ready → printing → completed`; `rendering|printing → failed → queued` (retry, max 3); `queued|ready → cancelled`.

- Enqueue: Print Station selection (≤ 200 cards / 50 certificates) → EF creates the job `queued` and immediately invokes the renderer (`rendering`); output multi-up PDF stored; → `ready` (realtime updates the station).
- `ready → printing`: the station device (authenticated by device token, §6.4) fetches the 5-min signed URL and opens the browser print dialog; → `completed` on user confirm ("Did it print correctly?" prompt), or `failed` with reason (paper jam etc.) enabling re-print without re-render.
- Every job stores `template_version_id` actually used (v1 risk mitigation, now a column) and the mandatory-preview flag: the station refuses to print a batch whose preview modal was never opened (client-enforced + `previewed_at` stamped server-side by the preview call).

### 2.14 Communication workflows

- All outbound messages flow through the `notifications` outbox — **no EF calls a provider inline** except the worker. This gives retries, dedupe, audit, and a kill switch (`feature flag comms.pause_all`).
- Announcements: school_admin composes (audience: all / role / branch / course package), stored in `announcements`, fan-out EF expands to outbox rows for SMS/email if channels selected; in-app is read live from `announcements` (no fan-out).
- Per-user channel preferences: `users.notification_prefs jsonb` (`{sms:true,email:true,push:false}`); statutory/financial messages (payment receipts, suspension notices) ignore opt-outs; marketing-ish ones respect them.
- Quiet hours: outbox worker defers non-urgent sends outside `tenant_settings.quiet_hours` (default 21:00–07:00 EAT); reminders scheduled to land inside allowed hours.
- SMS budget: `plans.limits.sms_credits`/month; worker decrements a counter; at 90% school_admin warned; at 100% SMS falls back to in-app+email and the Action Center shows "SMS budget exhausted".

---

## 3. Operations Modules

### 3.1 Dashboards

**3.1.1 Super Admin Platform Console** (`/platform`, role `super_admin` only, separate route tree — never mixed with tenant UI):
- **Tenants list**: name, status chip, plan, learners count vs limit, MRR, last activity, storage used; filters by status/plan; row actions: view, suspend/reactivate (Danger dialogs), record subscription payment, start offboarding.
- **Tenant detail**: subscription timeline, usage graphs (learners, lessons/week, SMS spend, storage), audit-log tail, feature-flag overrides for this tenant, "Impersonate" (below).
- **Impersonation**: mints a scoped read-write session as a synthetic `school_admin` of the tenant via EF `impersonate-tenant` — JWT carries `impersonator_user_id`; a persistent red banner shows in-app; **every** action while impersonating is audited with both ids; sessions max 60 min; tenants see impersonation events in their own audit log (transparency, mirroring the PayAxis God View pattern).
- **Platform health**: EF error rates, webhook failures, outbox backlog, cron last-run table (every cron writes a `cron_runs` heartbeat row; a red cell = missed run), RLS-denial spike widget.
- **Billing**: unpaid subscriptions, trials expiring in 7 days, churn list.

**3.1.2 School Admin Dashboard** (tenant home): v1's KPI list stands; add the **Action Center** — a prioritized task feed generated by the system: stale lessons (§2.5.5), unreconciled cash, expiring vehicle docs, expiring enrollments, pending registration reviews, failed print jobs, pending refund approvals, SMS budget warnings, invitation expiries. Each item deep-links to the fixing screen and disappears when the condition clears (computed, not stored — a `action_center_items` SQL view per role).

**3.1.3 Role home screens** (first screen after login, per role): instructor → today's lessons + start-lesson buttons; receptionist → today's bookings + review queue + quick actions (enroll, record payment, print); accountant → finance dashboard (day-close, overdue invoices, refund queue); learner → next lesson, hour-bank progress ring, balance due, latest feedback; parent → linked learners' cards; examiner → pending gradings + ready-for-exam queue.

### 3.2 Monitoring & alerting (completing v1 §13 — routing added, G22)

**Health endpoint contract** (`GET /functions/v1/health`, public, cached 30s):
```json
{ "status": "ok|degraded|down",
  "checks": { "db": "ok", "storage": "ok", "auth": "ok", "outbox_backlog": 12, "oldest_queued_notification_s": 45 },
  "version": "2026.07.19-a1b2c3", "region": "eu-central-1" }
```
`degraded` when any non-db check fails or backlog > 500; `down` when db unreachable. Uptime monitor (Better Uptime) hits it every 60s from 2 regions.

**Alert routing matrix:**
| Alert | Channel | Who | Urgency |
|---|---|---|---|
| Health `down` / db pool > 80% 5 min | Phone call + Telegram | On-call engineer | P1, 24/7 |
| EF error rate > 2% / webhook failures / cron missed | Telegram + email | On-call | P2, business hours+ |
| RLS denial spike > 10× baseline | Telegram (security channel) | Engineer + Esk | P2 |
| Payment amount mismatch | Email + Action Center | Accountant of tenant + platform | P2 |
| Outbox failure rate > 10% 15 min | Telegram | On-call | P3 |
| Storage > 85% of plan / cert-verify rate-limit trips > 100/h | Email weekly digest | Platform | P4 |
Sentry is the source for error alerts; DB/infra alerts come from Supabase webhooks into a tiny `alert-router` EF that fans out to Telegram bot + email. Every P1/P2 auto-creates an incident note (markdown file in the ops repo via GitHub API) — lightweight, no PagerDuty dependency at this scale.

### 3.3 Audit logging & viewer

- Trigger coverage (extends v1 §10): add `users` (all ops), `user_invitations`, `refunds`, `id_cards`, `certificates`, `*_templates` (status + layout_version changes only, not every autosave — autosaves are captured by `template_versions`), `tenant_settings`, `feature_flags`, `sponsor_links`, `print_station_devices`, and **storage downloads of KYC/cards/certificates** (logged by the signed-URL-issuing EFs, since Storage itself can't trigger).
- `audit_logs` is **append-only**: `revoke update, delete on public.audit_logs from authenticated;` + no RLS write policy for any tenant role; only triggers (SECURITY DEFINER) insert.
- Retention: 24 months hot, then exported monthly to cold storage (Storage bucket `audit-archive/`, ndjson.gz) by cron `archive-audit-logs`, rows deleted after export verified.
- **Viewer UI** (`/app/manage/:slug/audit`, school_admin + accountant read): filter by actor, table, action, date range (EthDatePicker), record id; row expands to a before/after JSON diff (red/green); export filtered set to CSV (≤ 10k rows, else async export EF → email link). Super admin has the platform-wide equivalent with a tenant filter.

### 3.4 Backup & restore (G15)

**3.4.1 Automatic:** Supabase PITR enabled on production (7-day window minimum; upgrade to 14 when tenant count > 20). Daily logical dump (`pg_dump --format=custom`) via GitHub Actions scheduled job to an encrypted off-Supabase bucket (Backblaze B2 / S3), retained 30 daily + 12 monthly. Storage buckets replicated weekly by a sync job (rclone) to the same off-site target. **Off-platform copies are mandatory** — the vendor-lock-in mitigation in v1 is only real if backups live elsewhere.

**3.4.2 Objectives:** RPO ≤ 24h (logical) / ≤ 2 min (PITR); RTO ≤ 4h for full-project restore, ≤ 1h for single-tenant logical restore.

**3.4.3 Restore procedures (runbook, kept in `ops/runbooks/restore.md`):**
1. *Full disaster:* new Supabase project → apply migrations from git → `pg_restore` latest dump → re-point Vercel env → deploy EFs → smoke tests (§9) → DNS. Practiced quarterly against staging ("restore drill" calendar item; drill results logged).
2. *Single-tenant logical restore* (tenant deleted data by mistake): restore dump into a scratch database, `COPY` the tenant's rows per table in FK order into production with `ON CONFLICT DO NOTHING`, storage objects rclone'd back by prefix. Requires super_admin + engineer four-eyes.
3. *Tenant offboarding purge:* explicit ordered-delete script (children→parents), storage prefix delete, tombstone kept — this is why `on delete restrict` (§1.1): purges must be deliberate, never accidental cascades.

### 3.5 User & role management screens

- **Users list** (school_admin): table (name, email, role, branch, status, last sign-in), invite button, row actions: edit role (§5.5.3), change branch, disable/enable (§5.5.2), send password reset, view user's audit trail. Instructors/learners created via their own modules auto-appear here once portal-linked.
- **Pending invitations tab**: resend / revoke; expired shown greyed 30 days.
- **Branch management**: CRUD; deleting a branch requires zero attached active learners/instructors/vehicles (guard with reassignment helper dialog).
- **Role capability matrix** rendered in-app (read-only) so admins see exactly what each role can do — generated from a `role_capabilities` constant shared with route guards, keeping docs and enforcement from drifting.

### 3.6 Data retention & compliance schedule (G27)

| Data | Retention | Mechanism |
|---|---|---|
| Rejected/expired registration KYC | 30 days after terminal state | cron `purge-pending-kyc` |
| Learner KYC after learner archived | 12 months, then delete files, keep metadata | cron |
| Audit logs | 24 mo hot + archive (§3.3) | cron |
| Notifications outbox | 6 months | cron partition drop |
| Payment/invoice/refund records | 7 years (Ethiopian commercial records practice — **confirm with the school's accountant/legal before go-live**) | never auto-purged |
| Template versions | last 50 per template | trigger prune |
| Cron heartbeats, rate-limit buckets | 30 days / 24h | cron |
| Learner data-deletion request | EF `delete-learner-data`: hard-deletes personal rows, anonymizes financial rows (name→`[deleted]`), keeps aggregates; produces a deletion certificate PDF for the school | on request, school_admin + confirmation |

---

## 4. Feature Toggles & Configuration Switches (G13 — complete catalog)

Two layers, deliberately distinct:

**A. Platform feature flags** (`feature_flags`, super_admin managed, read by SPA at boot + EFs; per-tenant and per-role targeting per v1 schema). Defined flags:

| Key | Default | Gates |
|---|---|---|
| `payments.chapa` / `payments.telebirr` | off | provider buttons + initiate-payment path |
| `payments.online_any` | off | entire online-payment UI (cash-only mode) |
| `exams.mock_engine` | off until Phase 3 | exam module routes |
| `portal.learner` / `portal.parent` | on / off | portal login roles |
| `pwa.offline_attendance` | off | service-worker queue |
| `templates.designer_v2` | off | snap/guides/layers/history features |
| `certificates.public_verification` | off until Phase 3 | verify endpoint (returns 404-page when off) |
| `comms.sms` / `comms.email` / `comms.pause_all` | on/on/off | outbox worker channel gates; `pause_all` is the kill switch |
| `registration.public_form` | on | public form (per-tenant off = "registration closed" page) |
| `billing.enforce_limits` | on | plan-limit checks (off = log-only, for migration grace) |
| `platform.maintenance_banner` | off | dismissible banner with message payload |

Flag reads are cached 60s client-side; EF reads hit the Redis/Postgres cache. Changing a flag is audited.

**B. Tenant settings** (`tenant_settings` — school_admin managed via Settings screens, all changes audited). Full catalog (existing v1 keys kept, new ones marked •):

| Group | Key | Type/Default |
|---|---|---|
| Locale | `default_locale` | en/am/om, `en` |
| Calendar | `date_calendar` | ethiopian |
| General | `timezone` | Africa/Addis_Ababa · `currency` ETB · `working_hours` jsonb · `brand` jsonb (logo asset id, primary color) |
| Categories | `enabled_license_categories` | ['4'] • (default changed from B — Ethiopian codes) |
| Scheduling• | `instructors_self_schedule` bool false · `lesson_slot_minutes` int 60 · `min_book_ahead_hours` 12 · `max_book_ahead_days` 30 · `late_cancel_hours` 24 · `late_cancel_policy` deduct_half · `no_show_policy` deduct_full · `max_overrun_hours` 2 |
| Enrollment• | `min_activation_pct` 25 · `extend_expiry_on_hold` true · `require_mock_exam_pass` false |
| Finance• | `refund_four_eyes` true · `invoice_due_days` 7 · `overdue_grace_days` 3 |
| Cards/Certs• | `card_validity_months` 12 · `card_replacement_fee` 200.00 · `require_fee_before_replacement` true |
| Comms• | `quiet_hours` {start:"21:00",end:"07:00"} · `reminder_offsets_hours` [24,2] |
| Registration• | `registration_open` true · `registration_welcome_text` per-locale jsonb |
| Auto-ops• | `auto_ground_on_expired_docs` true |

Settings UI: grouped tabs mirroring the table; every field has helper text in all three locales; Save per-tab with dirty-state guard (§5.7.2).

---

## 5. UI Dialog Inventory (G12)

Global dialog rules (binding for every dialog below): (a) shadcn `Dialog`/`AlertDialog`; focus-trapped; `Esc` cancels unless a destructive action is mid-flight; (b) primary action disabled while pending with spinner + the button label switching to a progress verb ("Saving…"); (c) all server errors render inline in the dialog via the §7 error map — never a bare toast for a failed dialog action; (d) destructive confirmations (`AlertDialog`) never have the destructive button as the default-focused element; (e) all copy via i18n keys; dates via EthDatePicker; (f) forms are RHF+Zod, submit disabled until valid, server-side Zod re-validates.

### 5.1 Platform (super admin)
1. **Tenant Onboarding Wizard** — 3 steps: ① School (name, slug — live uniqueness check, debounced; locale, calendar, timezone); ② Plan & trial (plan select, trial days 0–60); ③ First admin (name, email — warns if email already exists on the platform). Review pane → Create. Failure mid-EF is atomic (EF compensates: created auth user without tenant row is deleted). Edge: slug taken → inline error + suggestion `{slug}-2`.
2. **Suspend Tenant** — AlertDialog; reason (select + free text) required; shows impact copy ("all writes blocked, X active users"); type slug to confirm.
3. **Start Offboarding** — Danger dialog; requires typing `OFFBOARD {slug}`; shows the 30-day timeline and export note; button disabled until the export EF returns the archive link (export first, destroy later).
4. **Record Subscription Payment** — amount (prefilled), period covered, method, reference; edge: overlapping period → warning, allowed.
5. **Impersonate** — reason required (audited); duration select 15/30/60 min; consent copy about tenant-visible logging.

### 5.2 Public registration & review
1. **Public Registration Form** (mobile-first, unauthenticated, per-tenant URL `/r/:slug`): steps ① Personal (name, phone — Ethiopian format `+2519/7…` validated; email optional; DoB via EthDatePicker; gender) ② License category (only tenant-enabled, with localized descriptions) ③ Preferred branch + schedule (chips: weekday-morning/afternoon/evening/weekend) ④ KYC upload (ID front/back, ≤ 5 MB each, jpg/png/pdf; client-side compress > 2 MB) ⑤ Consent checkbox (localized privacy text) + Turnstile → submit. Success screen: tracking code + "SMS sent" note + save-code hint. Edges: duplicate active submission → generic "already received" (no enumeration); rate limit hit → friendly retry-later; upload fails → per-file retry chip without losing the form; offline mid-submit → local draft in sessionStorage restored on return.
2. **Review Submission Dialog** (receptionist): left = form data + KYC viewer (images zoomable; PDF inline); right = duplicate panel (§2.3), notes, decision buttons. Reject requires reason category; approve enables Convert. Edge: files missing/corrupt → "Request re-upload" action sends templated SMS with a one-time re-upload link (same pending bucket, same submission row).
3. **Convert-to-Learner Wizard** — ① Learner record (pre-filled, editable; branch required) ② Enrollment (optional toggle): package select showing hours/price/validity; installment plan builder (n, dates via EthDatePicker, auto-split amounts, must sum — live remainder display) ③ Review → Convert. Edges: package none selected → converts learner only, banner "no enrollment yet"; EF partial failure → resumes at failed step (idempotent by submission id); phone now matching an existing learner (created since review) → hard stop with merge guidance.

### 5.3 Scheduling & lessons
1. **Enroll Learner Dialog** (from learner profile) — same as Convert step ② standalone. Edge: learner has an `active` enrollment for the same category → warning "parallel enrollment" requiring school_admin role to proceed.
2. **Schedule Lesson Dialog** — type (theory/practical/simulator); instructor (filtered by category cert + availability); date+time (EthDatePicker + slot picker rendering availability green/booked red); learners multi-select (≤ capacity; each shows remaining hours — 0 remaining blocks selection with "top-up" link); vehicle auto-suggest (matching transmission, free, docs valid) with manual override. Conflict on submit (`SCHED_CONFLICT`) → inline panel listing the clashing booking + "pick another slot" refresh. Edge: instructor availability changed between open and submit → same conflict path; lesson outside working hours → blocked unless school_admin override checkbox (audited).
3. **Cancel Lesson Dialog** — reason select (differs per actor); **penalty preview line** ("Cancelling now deducts 0.5 h from Abebe's hour bank — late-cancel policy") computed live; sponsor-notification checkbox. Edge: lesson already `in_progress` → dialog blocked with explanation.
4. **End Lesson Wizard** (instructor, mobile-optimized) — ① Times (actual start/end prefilled; duration auto; > scheduled+50% → confirmation) ② Attendance per learner (present/late/absent toggle; absent asks "convert to no-show penalty?") ③ Evaluations: skill checklist for the category, 0–5 star rows, notes with `internal` flag, "carry forward last scores" helper ④ Vehicle: odometer (must be > last; else inline error), fuel level optional ⑤ Review → Complete. Offline: whole wizard queues (§2.5.6). Edge: app killed mid-wizard → draft in IndexedDB restored.
5. **Attendance Conflict Dialog** (offline replay 409) — two-column diff (server vs. yours), actions: "Keep server / File amendment"; amendment creates an audited correction record, never overwrites.
6. **Reschedule Dialog** — combined cancel-reason + new-slot picker; single EF; shows both notifications that will fire.
7. **Mark No-Show Dialog** — penalty preview; optional note; disabled before `scheduled_start + 15 min` with countdown.

### 5.4 Finance
1. **Create Invoice Dialog** (accountant/school_admin) — learner, line-item table (kind, desc, qty, unit), due date, live total; issue now vs. save draft. Edge: zero/negative total blocked; discount item cannot exceed subtotal.
2. **Record Payment Dialog** (receptionist/accountant) — invoice select (open invoices for learner, balance shown), amount (default = balance; partial allowed; **overpayment blocked** with "create credit? contact accountant" hint), method (cash/bank/cheque), reference (required for non-cash), date. Prints/downloads receipt on success. Edge: invoice paid concurrently → `INVOICE_ALREADY_SETTLED` refresh prompt.
3. **Request Refund Dialog** — payment context header; amount ≤ refundable (live max shown); reason; method. Approval variant shows requester, four-eyes note; Reject requires reason.
4. **Void Invoice** — AlertDialog; reason; blocked if any `succeeded` payment attached ("refund first").
5. **Day-Close Reconciliation screen** (accountant) — per-receptionist cash list with checkboxes → "Mark reconciled" AlertDialog showing total; discrepancy field (amount + note) if ticked short.
6. **Online Payment Sheet** (learner/parent portal) — provider choice (flag-gated), amount (full/installment-due), redirect notice; return handling: success/pending/failed states polled 10s × 30 against the payment row; pending-timeout copy: "confirmation may take a few minutes — receipt will arrive by SMS".

### 5.5 Users & roles
1. **Invite User Dialog** — email, role (with capability summary tooltip), branch (required for branch-scoped roles); duplicate pending → inline "Resend instead?".
2. **Disable User** — AlertDialog; consequences copy (immediate global sign-out); blocked for self and last-admin (`LAST_ADMIN_GUARD` message).
3. **Change Role Dialog** — current → new with capability diff list ("gains: refunds approval; loses: lesson delivery"); to-school_admin requires slug confirmation; instructor→other with future lessons assigned → blocked until lessons reassigned (helper link).
4. **Link Portal Account** (learner/parent invite) — email/phone; if existing same-tenant user → confirm-link variant (§2.2.4).

### 5.6 Templates, cards, certificates, printing
1. **Template Publish Dialog** — validation results panel (token check, bounds check — errors block, warnings listed); "will archive current published {name}" note; preview thumbnail; confirm.
2. **Template Take-Over Dialog** — per §2.10; shows lock holder + last heartbeat age.
3. **Template Version Conflict Dialog** — per §2.10; "Reload theirs / Save mine as new draft".
4. **Issue ID Card Dialog** — holder summary + photo (capture/upload inline if missing — camera permission fallback to file input); validity preview (issue/expiry both calendars); serial preview; fee note if replacement.
5. **Report Lost Card** — AlertDialog; auto-offers replacement flow with fee copy.
6. **Issue Certificate Dialog** — type select (eligible types computed: completion requires `completed` enrollment etc. — ineligible shown disabled with reason tooltips); template = published for type; preview (rendered with real data, mandatory open before Issue enabled); delivery checkboxes (SMS link / email PDF).
7. **Revoke Certificate** — Danger dialog; reason mandatory; irreversibility copy; verification-page consequence shown.
8. **Batch Print Wizard** (Print Station) — ① Filter & select rows (cards: by branch/status/expiring-window; certs: by date/type) with running count vs. 200/50 cap (over-cap → auto-split into N jobs, stated) ② Layout (multi-up 8/10 per page for cards; per-tenant default) ③ **Mandatory preview** (first + random middle page rendered) ④ Enqueue. Job cards show live status; `failed` shows error + Retry (re-render) / Reprint (reuse PDF).
9. **Register Print Device Dialog** (school_admin) — name + branch → shows the device token **once** with copy button + "I stored it" checkbox to close; revoke from device list.

### 5.7 Cross-cutting
1. **Global Error Dialog** — for unrecoverable route errors (chunk-load failure, 500 on critical fetch): "Something went wrong" + request id + Retry / Reload buttons; auto-Sentry report.
2. **Unsaved Changes Guard** — router blocker on all dirty forms: Save & leave / Discard / Stay.
3. **Session Expiry Dialog** — on refresh-token failure: "Signed out for security" → login redirect preserving deep link. On `user_disabled`/`tenant suspended`: distinct copy, no retry.
4. **Confirm Calendar Ambiguity Tooltip** (not a dialog, but binding): every EthDatePicker shows the converse calendar's date as helper text ("= 27 Oct 2026 G.C.") — the v1 risk mitigation made mandatory UI.
5. **Language Switcher Sheet** — per-user; instant apply; persists to profile + localStorage.
6. **Kill-switch banners** — `comms.pause_all`, suspension, maintenance: non-dismissible variants pinned above app shell.

---

## 6. Authentication & Authorization — Complete Spec (G17)

### 6.1 Session & token policy
- Access token TTL 60 min; refresh token rotation on (Supabase default); refresh reuse detection → global sign-out of that user + security audit event.
- Persistent sessions in `localStorage` (Supabase default) — acceptable because CSP is strict and no third-party scripts run; **no session cookie** (v1 CSRF stance preserved).
- Idle timeout (client-enforced): staff roles 8h of inactivity → soft lock screen (re-enter password); learner/parent none. Print Station devices: no idle lock (kiosk), but device token required per §6.4.
- Concurrent sessions: allowed; Users screen shows "sign out all sessions" per user (admin) and self ("sign out other devices" in profile).

### 6.2 Password & account policy
- Min 10 chars, zxcvbn score ≥ 3 (client + `accept-invite`/reset EF server check); no composition rules beyond that; no forced rotation.
- Lockout: Supabase Auth rate limits sign-in attempts; additionally the SPA backs off UI after 5 failures and shows reset guidance. (Supabase-side attempt limits are configured in Auth settings — record the chosen values in `ops/auth-settings.md`.)
- MFA: TOTP **required** for `super_admin` (enforced at platform-console route guard: no verified TOTP factor → forced enrollment screen); optional (opt-in) for `school_admin`/`accountant`; Phase 1 feature — Supabase MFA API.
- Email change: requires re-auth + confirmation to both old and new addresses (Supabase double-confirm on).
- Phone OTP sign-in: Phase 3 per v1, learners only, behind `portal.learner_otp` flag.

### 6.3 JWT claims (canonical contract)
```json
{ "sub": "<auth uid>", "tenant_id": "…", "user_id": "…", "role": "instructor",
  "branch_id": "…|null", "user_status": "active", "tenant_status": "active",
  "impersonator_user_id": "…|absent", "locale": "am" }
```
Custom access-token hook reads `public.users` (+ `tenants.status`) at every mint; claims are therefore ≤ 60 min stale — every place where that staleness matters (disable, suspend, role change) also has a server-side DB check per §2.1/§2.2, and forced global sign-out closes the gap immediately when needed.

### 6.4 Print-station device auth
- Device token: 32-byte random, shown once (§5.6.9), stored hashed. Requests to `print-id-card-job` carry `Authorization: Bearer <staff JWT>` **and** `X-Print-Device: <token>` — both must validate and belong to the same tenant; token match updates `last_seen_at`. Revoked/unknown device → `PRINT_DEVICE_INVALID` and the station UI drops into re-registration mode.

### 6.5 Authorization matrix (route + capability level)
Single source `src/lib/role-capabilities.ts` (mirrored into a SQL seed for the in-app matrix §3.5). Excerpt of the binding matrix — full file enumerates all ~60 capabilities:

| Capability | super | school_admin | branch_mgr | accountant | receptionist | instructor | examiner | learner | parent |
|---|---|---|---|---|---|---|---|---|---|
| tenants.manage | ✔ | | | | | | | | |
| users.invite/disable/role | ✔ | ✔ | branch-scoped invite of receptionist/instructor only | | | | | | |
| settings.edit | ✔ | ✔ | | | | | | | |
| templates.edit/publish | ✔ | ✔ | | | | | | | |
| cards/certs.issue | ✔ | ✔ | ✔ | | ✔ | | | | |
| certs.revoke | ✔ | ✔ | | ✔ | | | | | |
| registrations.review | ✔ | ✔ | ✔ | | ✔ | | | | |
| lessons.schedule | ✔ | ✔ | ✔ | | ✔ | self (flag) | | | |
| lessons.deliver (start/complete/no-show) | | | | | | ✔ own | | | |
| exams.grade/void, milestones.ready_signoff | ✔ | ✔ | | | | | ✔ | | |
| invoices.create/void, refunds.approve | ✔ | ✔ | | ✔ | | | | | |
| payments.record_cash | ✔ | ✔ | ✔ | ✔ | ✔ | | | | |
| payments.pay_online | | | | | | | | ✔ | ✔ (can_pay links) |
| finance.reports | ✔ | ✔ | branch only | ✔ | | | | | |
| audit.view | ✔ | ✔ | | ✔ read | | | | | |
| own progress/lessons/invoices | — | — | — | — | — | own | own | ✔ | linked ✔ |

Branch scoping: for `branch_manager`/`receptionist` with `branch_id` set, every listed ✔ is additionally filtered `branch_id = jwt.branch_id` in RLS (v1 §9 pattern). A null `branch_id` on those roles means all-branches (single-branch schools skip the concept entirely — the UI hides branch pickers when `count(branches)=1`).

### 6.6 RLS test harness (making the v1 CI promise concrete)
`supabase/tests/rls/` contains one pgTAP file per table asserting, for a seeded two-tenant fixture: (a) cross-tenant select returns 0 rows for every role; (b) each row of the capability matrix above as positive/negative assertions; (c) write-block under `tenant_status='suspended'`; (d) learner cannot read `mock_exam_question_options.is_correct` mid-attempt. CI fails the PR if any table with RLS enabled lacks a test file (a meta-test queries `pg_policies` vs. the test directory listing).

---

## 7. Error Handling Standard (G14)

### 7.1 Envelope
All EFs return RFC 7807+extensions; PostgREST errors are normalized client-side into the same shape by a single `normalizeError()`:
```json
{ "type": "https://errors.app/SCHED_CONFLICT", "title": "Scheduling conflict",
  "status": 409, "code": "SCHED_CONFLICT", "detail": "Instructor already booked 09:00–10:00",
  "request_id": "req_…", "fields": { "scheduled_start": "overlaps" }, "retryable": false }
```
`request_id` is generated per request, logged in Sentry + EF logs, and shown in the Global Error Dialog for support.

### 7.2 Error code catalog (client i18n-mapped; `errors.{code}` keys in all 3 locales)
| Code | HTTP | Retryable | Surfaced as |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | no | field-level inline (from `fields`) |
| `UNAUTHENTICATED` | 401 | no | Session Expiry Dialog |
| `FORBIDDEN` / `TENANT_SUSPENDED` / `USER_DISABLED` | 403 | no | route redirect / dedicated screens |
| `NOT_FOUND` | 404 | no | empty-state |
| `SCHED_CONFLICT` / `LEARNER_DOUBLE_BOOKED` | 409 | no | conflict panel §5.3.2 |
| `TEMPLATE_VERSION_CONFLICT` | 409 | no | §5.6.3 |
| `LESSON_ALREADY_COMPLETED` / `INVOICE_ALREADY_SETTLED` | 409 | no | refresh prompts |
| `INVITE_EXISTS` / `LAST_ADMIN_GUARD` | 409 | no | inline |
| `PLAN_LIMIT_REACHED` | 402 | no | upgrade prompt (admin) / generic (staff) |
| `HOUR_BANK_EXHAUSTED` / `VEHICLE_DOC_EXPIRED` / `TEMPLATE_TOKEN_UNRESOLVED` / `PRINT_DEVICE_INVALID` | 422 | no | inline with action link |
| `RATE_LIMITED` | 429 | after `Retry-After` | friendly wait copy |
| `PROVIDER_UNAVAILABLE` | 502 | yes | retry with backoff, offer alternate provider |
| `INTERNAL` | 500 | yes ×1 | Global Error Dialog |

### 7.3 Client policy
- TanStack Query: retry only `retryable` codes and network errors (max 2, exponential); mutations never auto-retry except idempotency-keyed ones (payments, lesson-complete).
- Optimistic mutations (attendance, statuses) roll back on error + toast with the mapped message; the toast for `409`s includes a "Refresh" action.
- Offline: `navigator.onLine` + failed-fetch heuristic → global offline banner; queries serve cache with a "stale" chip; mutations outside the PWA queue are blocked with explanation.
- Every unexpected error path hits Sentry with `tenant_id`, `role`, `route`, `request_id` tags (no PII in tags).

### 7.4 Edge Function internals
- Shared `_shared/handler.ts` wrapper: request-id, Zod parse (→`VALIDATION_FAILED` with flattened `fields`), auth extraction, capability check, try/catch → envelope, structured log line (json) per request. No EF is written without the wrapper.
- Postgres error mapping table (SQLSTATE → code): `23P01→SCHED_CONFLICT`, `23505→` context-specific conflict, `P0001` (raise) passes through the raised code.

---

## 8. Deployment, Environments, Bootstrap

### 8.1 Environments & promotion
Local (supabase CLI) → Staging (own Supabase project + Vercel preview alias, anonymized seed) → Production. Promotion: migrations auto-apply to staging on merge; production apply is a manually-approved GitHub Actions environment gate (required reviewer). EF deploys follow the same gate. SPA: Vercel preview per PR, production on main after the migration job succeeds (ordering enforced: `db push` job → `functions deploy` job → Vercel promote — schema first, code second; all migrations must be backwards-compatible one release back so the old SPA never breaks during the window; expand-and-contract for renames).

### 8.2 Environment variable & secret catalog (G16)
| Name | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Vercel | public by design |
| `VITE_SENTRY_DSN`, `VITE_APP_VERSION` | Vercel | version = git sha, injected at build |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets (EFs only) | **never** in Vercel/client; rotation runbook `ops/runbooks/rotate-keys.md` (quarterly) |
| `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` | Supabase Vault | per §2.7.5 checklist |
| `TELEBIRR_APP_ID/KEY/PUBLIC_KEY` | Vault | |
| `AFROMESSAGE_API_KEY`, `RESEND_API_KEY` | Vault | |
| `TURNSTILE_SECRET` | Vault | site key is public in SPA env |
| `UPSTASH_REDIS_URL/TOKEN` | Vault | Phase 2+ |
| `BACKUP_S3_*` | GitHub Actions secrets | backup job only |
| `TELEGRAM_ALERT_BOT_TOKEN/CHAT_ID` | Vault | alert-router |
CI check: an `env.schema.ts` (Zod) validates presence at EF cold start and at SPA build; missing var = failed boot, not silent undefined.

### 8.3 CSP, headers, hosting hardening (delta to v1)
Add to the v1 CSP: `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, Turnstile (`challenges.cloudflare.com`) in `script-src`/`frame-src`, Sentry ingest in `connect-src`; headers `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self)` (photo capture). Public verification page on a separate subdomain (`verify.…`) with its own minimal CSP.

### 8.4 Bootstrap & seed (G23)
`supabase/seed.sql` (idempotent) creates: platform `plans`, global `license_categories` (Appendix G data), default `skills` per category, default `notification_templates` (all keys × 3 locales × channels — CI asserts completeness), `status_transitions` matrix (§2), demo tenant in staging only. First `super_admin`: created by `scripts/bootstrap-super-admin.ts` run once per environment (email from prompt, forces MFA enrollment on first login); the script refuses to run if a super_admin exists.

### 8.5 Definition of "deployable"
A release is deployable when: all CI gates green (lint, typecheck, unit, RLS pgTAP, EF tests, golden-file PDF diffs, i18n completeness check, migration dry-run against a staging clone), staging smoke suite (§9.2) passed, and the release notes list any manual ops steps (flag flips, seed updates).

---

## 9. Acceptance Criteria & Test Plan (G29)

### 9.1 Per-module definition of done (excerpt — full checklist lives in `docs/acceptance/*.md`, one file per module, generated from this section)
Every module is done only when: all its §2 transitions have positive+negative EF/pgTAP tests; all its §5 dialogs handle the listed edge cases with i18n copy in en/am/om; RLS tests per §6.6; audit rows verified for every mutating action; and the module works with `date_calendar='ethiopian'` end-to-end (create → display → edit round-trip on real Pagume and year-boundary dates — reusing the cybercom-et-cal fixture style, including Pagume 5/6 and Meskerem 1 boundaries).

### 9.2 Smoke suite (staging + post-deploy production, Playwright)
1. Sign in each of 4 roles; tenant isolation probe (tenant-B id in URL/api → 0 rows/403).
2. Public registration → review → convert → enroll → invoice appears.
3. Schedule lesson (conflict rejected) → start → complete with evaluation → hour bank decremented.
4. Record cash payment → receipt PDF downloads → invoice `paid`.
5. Issue ID card → PDF renders → verify QR; issue certificate → public verify returns `valid`; revoke → `revoked`.
6. Template edit → autosave → publish gate blocks a bad token → fix → publish.
7. Health endpoint `ok`; outbox drains a test notification.

### 9.3 Non-functional gates
p95 < 500 ms for list endpoints at 50k learners/tenant fixture; batch of 200 cards renders < 90 s; Lighthouse PWA/perf ≥ 85 on the learner portal over simulated 3G (Ethiopian mobile reality); locale bundles ≤ 40 kB gz per namespace.

---

## 10. Build Order Delta (amends v1 §14 phases)
Phase 1 additions (must-have for "production-ready", pulled forward): user lifecycle (§2.2), tenant status enforcement (§2.1), serial sequences, refunds (cash path), error standard (§7), health + alert routing, backup job + restore runbook + first drill, bootstrap script, RLS harness, Action Center (minimal: reviews + stale lessons). Phase 2 additions: reconciliation day-close, installment plans, print devices, MFA opt-in, impersonation. Phase 3 unchanged plus retention crons. Everything else per v1.

---
*End of Build-Ready Specification v2.0 — companion to Blueprint v1. Sections §0–§10 govern where they conflict with v1.*
