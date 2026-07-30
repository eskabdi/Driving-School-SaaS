-- Lessons & scheduling (blueprint §2 module 5; spec §1.3.2, §1.3.6, §2.5)
--
-- Double-booking is prevented in the schema, not just the UI: an instructor
-- cannot have two overlapping active lessons (spec §1.3.6). The exclusion
-- violation (SQLSTATE 23P01) is mapped client-side to SCHED_CONFLICT (spec §7.4).

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid references public.branches(id),
  instructor_id uuid not null references public.instructors(id),
  lesson_type text not null check (lesson_type in ('theory', 'practical', 'simulator')),
  status lesson_status not null default 'scheduled',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  capacity int not null default 1,
  notes text,
  cancelled_reason text,
  cancelled_by uuid references public.users(id),
  rescheduled_from uuid references public.lessons(id),
  created_by uuid references public.users(id),
  -- Generated half-open range used by the exclusion constraint (spec §1.3.6).
  time_range tstzrange generated always as (tstzrange(scheduled_start, scheduled_end, '[)')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index on public.lessons (tenant_id, instructor_id, scheduled_start);
create index on public.lessons (tenant_id, status, scheduled_start);

-- No two active lessons for the same instructor may overlap.
alter table public.lessons
  add constraint no_instructor_overlap
  exclude using gist (
    tenant_id with =,
    instructor_id with =,
    time_range with &&
  )
  where (status in ('scheduled', 'confirmed', 'in_progress'));

-- One row per (lesson, learner), plus the vehicle used (spec §1.3.2).
create table public.lesson_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  learner_id uuid not null references public.learners(id),
  enrollment_id uuid references public.enrollments(id),
  vehicle_id uuid references public.vehicles(id),
  created_at timestamptz not null default now(),
  unique (lesson_id, learner_id)
);
create index on public.lesson_assignments (tenant_id, learner_id);
create index on public.lesson_assignments (tenant_id, vehicle_id);

create trigger set_updated_at before update on public.lessons
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lessons enable row level security;

-- Instructor sees their own lessons (spec §1.2 corrected mapping).
create policy "lessons_instructor_own" on public.lessons
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and instructor_id = public.current_instructor_id()
  );

-- Staff read within tenant.
create policy "lessons_staff_read" on public.lessons
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

-- Learner sees lessons they're assigned to.
create policy "lessons_learner_read" on public.lessons
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and exists (
      select 1 from public.lesson_assignments la
      where la.lesson_id = lessons.id
        and la.learner_id = public.current_learner_id()
    )
  );

-- Front-desk / admins schedule; instructors may start/complete their own.
create policy "lessons_staff_write" on public.lessons
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
    and public.tenant_is_writable()
  );

create policy "lessons_instructor_write" on public.lessons
  for update to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and instructor_id = public.current_instructor_id()
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and instructor_id = public.current_instructor_id()
    and public.tenant_is_writable()
  );

create policy "lessons_super_admin" on public.lessons
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.lesson_assignments enable row level security;

create policy "assignments_member_read" on public.lesson_assignments
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and (
      public.is_tenant_staff()
      or learner_id = public.current_learner_id()
    )
  );

create policy "assignments_staff_write" on public.lesson_assignments
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
    and public.tenant_is_writable()
  );

create policy "assignments_super_admin" on public.lesson_assignments
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

create trigger audit after insert or update or delete on public.lessons
  for each row execute function public.audit_row();
