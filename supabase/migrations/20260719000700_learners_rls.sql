-- RLS for the learners/enrollments/registration vertical (blueprint §9; spec §6.5)
--
-- Pattern: tenant isolation on read for staff; learners/sponsors see their own;
-- writes gated by role AND tenant_is_writable(); super_admin bypass everywhere.

-- Reusable staff predicate helper.
create or replace function public.is_tenant_staff()
returns boolean
language sql stable
as $$
  select public.get_role_from_jwt() in
    ('school_admin','branch_manager','receptionist','accountant','instructor','examiner')
$$;

-- ---------------------------------------------------------------------------
-- course_packages
-- ---------------------------------------------------------------------------
alter table public.course_packages enable row level security;

create policy "packages_member_read" on public.course_packages
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt());

create policy "packages_admin_write" on public.course_packages
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

create policy "packages_super_admin" on public.course_packages
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- learners
-- ---------------------------------------------------------------------------
alter table public.learners enable row level security;

-- Learner sees their own row.
create policy "learners_self_read" on public.learners
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and user_id = public.get_user_id_from_jwt());

-- Sponsor/parent sees linked learners.
create policy "learners_sponsor_read" on public.learners
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and sponsor_user_id = public.get_user_id_from_jwt()
  );

-- Staff read (branch-scoped for branch roles when branch_id claim is set).
create policy "learners_staff_read" on public.learners
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.is_tenant_staff()
    and (
      public.get_branch_id_from_jwt() is null
      or public.get_role_from_jwt() not in ('branch_manager','receptionist')
      or branch_id = public.get_branch_id_from_jwt()
    )
  );

-- Front-desk staff manage learners.
create policy "learners_staff_write" on public.learners
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager','receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager','receptionist')
    and public.tenant_is_writable()
  );

create policy "learners_super_admin" on public.learners
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
alter table public.enrollments enable row level security;

create policy "enrollments_self_read" on public.enrollments
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and learner_id = public.current_learner_id()
  );

create policy "enrollments_staff_read" on public.enrollments
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

-- Enrollment mutations go through the enroll-learner EF (service role) for
-- plan-limit checks and snapshotting; school_admin may still adjust directly.
create policy "enrollments_admin_write" on public.enrollments
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

create policy "enrollments_super_admin" on public.enrollments
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- invoices + invoice_items
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;

create policy "invoices_self_read" on public.invoices
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and learner_id = public.current_learner_id()
  );

create policy "invoices_staff_read" on public.invoices
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

create policy "invoices_finance_write" on public.invoices
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','accountant','receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','accountant','receptionist')
    and public.tenant_is_writable()
  );

create policy "invoices_super_admin" on public.invoices
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.invoice_items enable row level security;

create policy "invoice_items_read" on public.invoice_items
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and (
      public.is_tenant_staff()
      or exists (
        select 1 from public.invoices i
        where i.id = invoice_items.invoice_id
          and i.learner_id = public.current_learner_id()
      )
    )
  );

create policy "invoice_items_finance_write" on public.invoice_items
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','accountant','receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','accountant','receptionist')
    and public.tenant_is_writable()
  );

create policy "invoice_items_super_admin" on public.invoice_items
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- ---------------------------------------------------------------------------
-- public_registration_submissions
--   Inserts come only from the submit-public-registration EF (service role);
--   no anon/authenticated insert policy. Staff review; super_admin bypass.
-- ---------------------------------------------------------------------------
alter table public.public_registration_submissions enable row level security;

create policy "submissions_staff_read" on public.public_registration_submissions
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager','receptionist')
  );

create policy "submissions_staff_write" on public.public_registration_submissions
  for update to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager','receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin','branch_manager','receptionist')
    and public.tenant_is_writable()
  );

create policy "submissions_super_admin" on public.public_registration_submissions
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- Audit status transitions on submissions
create trigger audit after update on public.public_registration_submissions
  for each row execute function public.audit_row();
