-- Announcements (blueprint §2 module 10; spec §2.14)
--
-- In-app announcements are read live from this table (no fan-out); SMS/email
-- fan-out to the notifications outbox is layered on later. Audience targets a
-- role, a branch, or everyone in the tenant.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  title text not null,
  body text not null,
  audience text not null default 'all'
    check (audience in ('all', 'learners', 'instructors', 'staff', 'branch')),
  branch_id uuid references public.branches(id),   -- when audience = 'branch'
  created_by uuid references public.users(id),
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.announcements (tenant_id, published_at desc);

create trigger set_updated_at before update on public.announcements
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.announcements enable row level security;

-- Every tenant member can read announcements addressed to them. Audience
-- targeting is a coarse filter; 'all' is visible to everyone in the tenant.
create policy "announcements_member_read" on public.announcements
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and archived_at is null
    and (
      audience = 'all'
      or (audience = 'staff' and public.is_tenant_staff())
      or (audience = 'instructors' and public.get_role_from_jwt() = 'instructor')
      or (audience = 'learners' and public.get_role_from_jwt() in ('learner', 'parent'))
      or (audience = 'branch' and branch_id = public.get_branch_id_from_jwt())
    )
  );

-- school_admin / branch_manager compose announcements.
create policy "announcements_admin_write" on public.announcements
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

create policy "announcements_super_admin" on public.announcements
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());
