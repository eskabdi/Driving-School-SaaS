-- Learners, course packages, enrollments, invoicing, public registration
-- (blueprint §7; spec §1.3, §1.4, §2.3, §2.4). This is the first vertical
-- slice: Public Registration → Review → Convert → Enroll.

-- ---------------------------------------------------------------------------
-- Race-safe per-tenant serials (spec §1.3.13)
-- ---------------------------------------------------------------------------
create table public.serial_sequences (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  kind text not null,          -- 'learner_card','certificate','invoice','receipt','tracking',…
  ec_year int not null,        -- resets yearly on the Ethiopian year
  next_value bigint not null default 1,
  primary key (tenant_id, kind, ec_year)
);

-- Current Ethiopian year (approximate: Gregorian year - 8 before ~Sep, else -7).
-- Kept simple here; the SPA holds the precise converter. Serial year is only a
-- human-facing grouping, so month precision is not required.
create or replace function public.current_ec_year()
returns int
language sql stable
as $$
  select case
    when extract(month from now() at time zone 'Africa/Addis_Ababa') >= 9
      then extract(year from now() at time zone 'Africa/Addis_Ababa')::int - 7
    else extract(year from now() at time zone 'Africa/Addis_Ababa')::int - 8
  end
$$;

-- next_serial: atomic per-tenant counter. SECURITY DEFINER so only callable via
-- trusted RPC / Edge Functions, never directly from the client.
create or replace function public.next_serial(p_tenant uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := public.current_ec_year();
  v_seq bigint;
  v_prefix text;
begin
  insert into public.serial_sequences (tenant_id, kind, ec_year, next_value)
  values (p_tenant, p_kind, v_year, 2)
  on conflict (tenant_id, kind, ec_year)
    do update set next_value = public.serial_sequences.next_value + 1
  returning next_value - 1 into v_seq;

  v_prefix := case p_kind
    when 'learner_card'    then 'L'
    when 'instructor_card' then 'I'
    when 'certificate'     then 'C'
    when 'invoice'         then 'INV'
    when 'receipt'         then 'RCP'
    when 'tracking'        then 'R'
    else 'X'
  end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_seq::text, 6, '0'));
end;
$$;
revoke execute on function public.next_serial(uuid, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Course packages (blueprint §2 module 4)
-- ---------------------------------------------------------------------------
create table public.course_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  license_category_code text not null,
  name text not null,
  total_hours int not null check (total_hours > 0),
  price numeric(12,2) not null check (price >= 0),
  validity_days int not null default 180,
  required_transmission text not null default 'any'
    check (required_transmission in ('manual','automatic','any')),
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.course_packages (tenant_id, license_category_code);

-- ---------------------------------------------------------------------------
-- Learners (blueprint §7; spec §1.4)
-- ---------------------------------------------------------------------------
create table public.learners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid references public.branches(id),
  user_id uuid unique references public.users(id),   -- null until portal self-links (spec §2.2.4)
  full_name text not null,
  full_name_am text,
  full_name_om text,
  phone text,
  email text,
  license_category_applied text,
  sponsor_user_id uuid references public.users(id),
  photo_storage_path text,
  date_of_birth date,
  gender text check (gender in ('male','female','other')),
  address jsonb,
  emergency_contact jsonb,
  consent text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.learners (tenant_id);
create index on public.learners (tenant_id, branch_id);
create index on public.learners (tenant_id, phone);

-- ---------------------------------------------------------------------------
-- Enrollments (spec §2.4). hours_completed is never client-written.
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  learner_id uuid not null references public.learners(id),
  course_package_id uuid not null references public.course_packages(id),
  status enrollment_status not null default 'pending_payment',
  enrolled_at timestamptz not null default now(),
  expires_at date,
  hours_total int not null,                 -- snapshot from package at enroll time
  hours_completed numeric(6,2) not null default 0,
  price_at_enrollment numeric(12,2) not null,
  completed_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.enrollments (tenant_id, learner_id);
create index on public.enrollments (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Invoices + items (spec §1.3.8, §2.7)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  learner_id uuid not null references public.learners(id),
  enrollment_id uuid references public.enrollments(id),
  number text,
  status invoice_status not null default 'draft',
  amount numeric(12,2) not null default 0,
  due_date date,
  issued_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invoices (tenant_id, learner_id);
create index on public.invoices (tenant_id, status);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null,   -- 'package','extra_hours','exam_fee','id_card_replacement','penalty','discount','other'
  description text not null,
  qty numeric(8,2) not null default 1,
  unit_price numeric(12,2) not null,
  total numeric(12,2) generated always as (qty * unit_price) stored,
  created_at timestamptz not null default now()
);
create index on public.invoice_items (tenant_id, invoice_id);

-- ---------------------------------------------------------------------------
-- Public registration submissions (spec §2.3)
-- ---------------------------------------------------------------------------
create table public.public_registration_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  tracking_code text unique,
  full_name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  gender text check (gender in ('male','female','other')),
  license_category_applied text,
  preferred_branch_id uuid references public.branches(id),
  preferred_schedule text,
  kyc_storage_paths text[] not null default array[]::text[],
  consent text,
  status submission_status not null default 'submitted',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  rejected_reason text,
  duplicate_of uuid references public.learners(id),
  created_learner_id uuid references public.learners(id),
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.public_registration_submissions (tenant_id, status);
-- One active submission per phone per tenant (non-terminal states only; spec §2.3/G26).
create unique index public_reg_one_active_per_phone
  on public.public_registration_submissions (tenant_id, phone)
  where status in ('submitted','under_review','approved');

-- ---------------------------------------------------------------------------
-- Plan-limit check (spec §1.3.14)
-- ---------------------------------------------------------------------------
create or replace function public.check_plan_limit(p_tenant uuid, p_limit_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  select (p.limits ->> p_limit_key)::int into v_limit
  from public.tenant_subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant
  order by s.current_period_end desc
  limit 1;

  if v_limit is null then
    return true;  -- no limit configured → allow
  end if;

  if p_limit_key = 'max_learners' then
    select count(*) into v_count from public.learners
    where tenant_id = p_tenant and archived_at is null;
  else
    return true;
  end if;

  return v_count < v_limit;
end;
$$;

-- Learner identity helper (spec §1.2)
create or replace function public.current_learner_id()
returns uuid
language sql stable
as $$
  select l.id from public.learners l
  where l.user_id = (select public.get_user_id_from_jwt())
    and l.tenant_id = (select public.get_tenant_id_from_jwt())
$$;

-- updated_at triggers
create trigger set_updated_at before update on public.course_packages
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.learners
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.enrollments
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.invoices
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.public_registration_submissions
  for each row execute function public.tg_set_updated_at();

-- Audit triggers (spec §3.3): enrollments, invoices, submissions (status)
create trigger audit after insert or update or delete on public.enrollments
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.invoices
  for each row execute function public.audit_row();
