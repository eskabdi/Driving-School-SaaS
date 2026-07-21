-- Core tenant / identity tables (blueprint §5, §7; spec §1.1, §1.4)
--
-- Tenant-scoped tables use `tenant_id ... references tenants(id) on delete
-- restrict` — tenant deletion is an explicit offboarding job, never a cascade.

-- Platform billing plans (no tenant_id; spec §1.3.14)
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  monthly_price_etb numeric(12,2) not null,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global license categories — modelled on Ethiopia's Drivers' Qualification
-- Certification License Proclamation No. 1074/2018 (Federal Negarit Gazette
-- No. 27, Schedule). Seven top-level categories; Public Transport, Truck, and
-- Fuel Tanker each have sub-levels. `code` is the unique licensable unit
-- (e.g. '4-2' = Public II); `category_no` + `level` mirror the schedule.
create table public.license_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  category_no int not null,           -- 1..7 per the proclamation schedule
  level text,                          -- e.g. 'I','II','III' for multi-level categories; null otherwise
  name_en text not null,
  name_am text,
  name_om text,
  vehicle_description text,            -- "Types of Vehicle Operated" column
  min_age int,                         -- Age & Education Requirements (Art. 12)
  min_grade int,                       -- minimum completed school grade
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tenants
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  status tenant_status not null default 'trial',
  suspended_reason text,
  offboard_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tenant settings (blueprint §5, spec §4)
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  default_locale text not null default 'en' check (default_locale in ('en','am','om')),
  date_calendar text not null default 'ethiopian' check (date_calendar in ('ethiopian','gregorian')),
  timezone text not null default 'Africa/Addis_Ababa',
  currency text not null default 'ETB',
  working_hours jsonb not null default '{}'::jsonb,
  -- Default to Automobile (category 3, Proclamation No. 1074/2018).
  enabled_license_categories text[] not null default array['3']::text[],
  brand jsonb not null default '{}'::jsonb,
  -- Scheduling (spec §4)
  instructors_self_schedule boolean not null default false,
  lesson_slot_minutes int not null default 60,
  min_book_ahead_hours int not null default 12,
  max_book_ahead_days int not null default 30,
  late_cancel_hours int not null default 24,
  late_cancel_policy text not null default 'deduct_half',
  no_show_policy text not null default 'deduct_full',
  max_overrun_hours int not null default 2,
  -- Enrollment
  min_activation_pct int not null default 25,
  extend_expiry_on_hold boolean not null default true,
  require_mock_exam_pass boolean not null default false,
  -- Finance
  refund_four_eyes boolean not null default true,
  invoice_due_days int not null default 7,
  overdue_grace_days int not null default 3,
  -- Cards / certs
  card_validity_months int not null default 12,
  card_replacement_fee numeric(12,2) not null default 200.00,
  require_fee_before_replacement boolean not null default true,
  -- Comms
  quiet_hours jsonb not null default '{"start":"21:00","end":"07:00"}'::jsonb,
  reminder_offsets_hours int[] not null default array[24,2]::int[],
  -- Registration
  registration_open boolean not null default true,
  registration_welcome_text jsonb not null default '{}'::jsonb,
  -- Auto-ops
  auto_ground_on_expired_docs boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tenant subscriptions (spec §1.3.14)
create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  plan_id uuid not null references public.plans(id),
  status text not null check (status in ('trialing','active','past_due','cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tenant_subscriptions (tenant_id);

-- Branches
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  city text,
  address jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.branches (tenant_id);

-- Users (application-level; maps to auth.users; spec §1.4)
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete restrict,
  role app_role not null,
  status user_status not null default 'active',
  branch_id uuid references public.branches(id),
  full_name text,
  phone text,
  locale text not null default 'en' check (locale in ('en','am','om')),
  notification_prefs jsonb not null default '{"sms":true,"email":true,"push":false}'::jsonb,
  last_sign_in_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.users (tenant_id);
create index on public.users (auth_user_id);

-- Audit logs (blueprint §10; append-only). Created here because audit_row()
-- inserts into it; tenant_id is nullable to allow platform-level events.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  actor_user_id uuid,
  table_name text not null,
  action text not null,
  row_before jsonb,
  row_after jsonb,
  ip inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (tenant_id, created_at desc);
create index on public.audit_logs (table_name, created_at desc);

-- updated_at triggers on all mutable tables
create trigger set_updated_at before update on public.plans
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.license_categories
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.tenant_settings
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.tenant_subscriptions
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.branches
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.users
  for each row execute function public.tg_set_updated_at();
