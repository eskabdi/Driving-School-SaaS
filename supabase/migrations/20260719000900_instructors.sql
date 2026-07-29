-- Instructors + certification mapping (blueprint §2 module 2, §7; spec §1.2, §1.4)
--
-- instructors.user_id links to a login (nullable — an instructor may exist
-- before having an account). All instructor-facing RLS uses current_instructor_id().

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid references public.branches(id),
  user_id uuid unique references public.users(id),
  full_name text not null,
  phone text,
  email text,
  license_number text,
  license_issued_date date,
  license_expiry date,
  hire_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  photo_storage_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.instructors (tenant_id);
create index on public.instructors (tenant_id, branch_id);

-- Which license categories an instructor is certified to teach (spec §2.5.4).
create table public.instructor_license_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  license_category_code text not null,
  created_at timestamptz not null default now(),
  unique (instructor_id, license_category_code)
);
create index on public.instructor_license_categories (tenant_id, instructor_id);

-- Canonical instructor identity helper (spec §1.2).
create or replace function public.current_instructor_id()
returns uuid
language sql stable
as $$
  select i.id from public.instructors i
  where i.user_id = (select public.get_user_id_from_jwt())
    and i.tenant_id = (select public.get_tenant_id_from_jwt())
$$;

create trigger set_updated_at before update on public.instructors
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.instructors enable row level security;

-- Instructor sees their own row.
create policy "instructors_self_read" on public.instructors
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and user_id = public.get_user_id_from_jwt());

-- Staff read within tenant.
create policy "instructors_staff_read" on public.instructors
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

-- Admins manage instructors.
create policy "instructors_admin_write" on public.instructors
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager')
    and public.tenant_is_writable()
  );

create policy "instructors_super_admin" on public.instructors
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.instructor_license_categories enable row level security;

create policy "instructor_cats_member_read" on public.instructor_license_categories
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt());

create policy "instructor_cats_admin_write" on public.instructor_license_categories
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager')
    and public.tenant_is_writable()
  );

create policy "instructor_cats_super_admin" on public.instructor_license_categories
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

create trigger audit after insert or update or delete on public.instructors
  for each row execute function public.audit_row();
