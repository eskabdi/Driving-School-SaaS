-- Row Level Security (blueprint §5, §9; spec §2.1, §6.6)
--
-- Every tenant-scoped table: tenant isolation on read, tenant isolation AND
-- tenant_is_writable() on write, plus a super_admin bypass. Global reference
-- tables (plans, license_categories) are readable by any authenticated user
-- and writable only by super_admin.

-- ---------------------------------------------------------------------------
-- Global reference tables
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.license_categories enable row level security;

create policy "plans_read_all" on public.plans
  for select to authenticated using (true);
create policy "plans_super_admin_write" on public.plans
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

create policy "license_categories_read_all" on public.license_categories
  for select to authenticated using (true);
create policy "license_categories_super_admin_write" on public.license_categories
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;

create policy "tenants_member_read" on public.tenants
  for select to authenticated
  using (id = public.get_tenant_id_from_jwt());

create policy "tenants_super_admin_all" on public.tenants
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- tenant_settings
-- ---------------------------------------------------------------------------
alter table public.tenant_settings enable row level security;

create policy "tenant_settings_member_read" on public.tenant_settings
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt());

create policy "tenant_settings_admin_write" on public.tenant_settings
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() = 'school_admin'
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() = 'school_admin'
    and public.tenant_is_writable()
  );

create policy "tenant_settings_super_admin_all" on public.tenant_settings
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- tenant_subscriptions (super_admin managed; tenant reads own)
-- ---------------------------------------------------------------------------
alter table public.tenant_subscriptions enable row level security;

create policy "subscriptions_member_read" on public.tenant_subscriptions
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt());

create policy "subscriptions_super_admin_all" on public.tenant_subscriptions
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;

create policy "branches_member_read" on public.branches
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt());

create policy "branches_admin_write" on public.branches
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager')
    and public.tenant_is_writable()
  );

create policy "branches_super_admin_all" on public.branches
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

-- A user can always read their own row.
create policy "users_self_read" on public.users
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- Staff who manage users can read all users in their tenant.
create policy "users_admin_read" on public.users
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager')
  );

-- Writes to users go through Edge Functions (service role) for lifecycle
-- correctness (spec §2.2); no tenant-role write policy here. super_admin bypass
-- covers platform operations.
create policy "users_super_admin_all" on public.users
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- audit_logs (append-only; blueprint §10, spec §3.3)
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy "audit_logs_admin_read" on public.audit_logs
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','accountant')
  );

create policy "audit_logs_super_admin_read" on public.audit_logs
  for select to authenticated
  using (public.is_super_admin_from_jwt());

-- Only SECURITY DEFINER triggers insert; no role may update/delete.
revoke update, delete on public.audit_logs from authenticated;

-- Audit triggers on foundational tables (spec §3.3)
create trigger audit after insert or update or delete on public.users
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.tenant_settings
  for each row execute function public.audit_row();
