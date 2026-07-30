-- Lesson delivery: attendance, evaluations, skills, hour-bank recompute
-- (blueprint §2 modules 6-7; spec §2.4, §2.5, §2.8)
--
-- hours_completed is NEVER client-written — the complete_lesson RPC recomputes
-- it from attendance and caps it at hours_total + max_overrun_hours (spec §2.4).

-- Per-category skill checklist (spec §1.3.4). Tenant-customizable, seeded from
-- platform defaults.
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  license_category_code text not null,
  code text not null,
  name_en text not null,
  name_am text,
  name_om text,
  sort_order int not null default 0,
  required_for_completion boolean not null default true,
  min_score_to_pass int not null default 3,   -- 0..5 band
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, license_category_code, code)
);
create index on public.skills (tenant_id, license_category_code);

create table public.lesson_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  learner_id uuid not null references public.learners(id),
  enrollment_id uuid references public.enrollments(id),
  status text not null default 'present' check (status in ('present', 'late', 'absent')),
  actual_start timestamptz,
  actual_end timestamptz,
  hours_logged numeric(5,2) not null default 0,
  is_penalty boolean not null default false,   -- synthetic row for late-cancel/no-show
  marked_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (lesson_id, learner_id)
);
create index on public.lesson_attendance (tenant_id, learner_id, actual_start);
create index on public.lesson_attendance (tenant_id, enrollment_id);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lesson_id uuid references public.lessons(id) on delete cascade,
  learner_id uuid not null references public.learners(id),
  skill_id uuid references public.skills(id),
  score int not null check (score between 0 and 5),
  notes text,
  is_internal boolean not null default false,  -- hidden from learner/sponsor
  evaluated_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index on public.evaluations (tenant_id, learner_id, created_at desc);
create index on public.evaluations (tenant_id, lesson_id);

-- ---------------------------------------------------------------------------
-- complete_lesson RPC (spec §2.5): single transaction that records attendance
-- + evaluations, recomputes the enrollment hour bank, and marks the lesson
-- completed. SECURITY DEFINER + explicit tenant/instructor checks so it is safe
-- to call from the lesson-complete Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.complete_lesson(
  p_lesson_id uuid,
  p_attendance jsonb,   -- [{learner_id, enrollment_id, status, hours_logged}]
  p_evaluations jsonb   -- [{learner_id, skill_id, score, notes, is_internal}]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_status lesson_status;
  v_actor uuid := public.get_user_id_from_jwt();
  a jsonb;
  e jsonb;
  v_max_overrun int;
begin
  select tenant_id, status into v_tenant, v_status
  from public.lessons where id = p_lesson_id;
  if v_tenant is null then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_tenant <> public.get_tenant_id_from_jwt() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_status = 'completed' then
    raise exception 'LESSON_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  select coalesce(max_overrun_hours, 2) into v_max_overrun
  from public.tenant_settings where tenant_id = v_tenant;

  -- Attendance (upsert per learner).
  for a in select * from jsonb_array_elements(p_attendance) loop
    insert into public.lesson_attendance
      (tenant_id, lesson_id, learner_id, enrollment_id, status, hours_logged, marked_by, actual_start, actual_end)
    values (
      v_tenant, p_lesson_id,
      (a->>'learner_id')::uuid,
      nullif(a->>'enrollment_id','')::uuid,
      coalesce(a->>'status','present'),
      coalesce((a->>'hours_logged')::numeric, 0),
      v_actor, now(), now()
    )
    on conflict (lesson_id, learner_id) do update
      set status = excluded.status,
          hours_logged = excluded.hours_logged,
          marked_by = excluded.marked_by;
  end loop;

  -- Evaluations.
  for e in select * from jsonb_array_elements(p_evaluations) loop
    insert into public.evaluations
      (tenant_id, lesson_id, learner_id, skill_id, score, notes, is_internal, evaluated_by)
    values (
      v_tenant, p_lesson_id,
      (e->>'learner_id')::uuid,
      nullif(e->>'skill_id','')::uuid,
      (e->>'score')::int,
      e->>'notes',
      coalesce((e->>'is_internal')::boolean, false),
      v_actor
    );
  end loop;

  -- Recompute each affected enrollment's hour bank (capped).
  update public.enrollments en set hours_completed = least(
    (select coalesce(sum(la.hours_logged), 0)
       from public.lesson_attendance la
      where la.enrollment_id = en.id),
    en.hours_total + v_max_overrun
  )
  where en.id in (
    select distinct nullif(a2->>'enrollment_id','')::uuid
    from jsonb_array_elements(p_attendance) a2
    where nullif(a2->>'enrollment_id','') is not null
  );

  update public.lessons
    set status = 'completed', actual_end = now(),
        actual_start = coalesce(actual_start, now())
  where id = p_lesson_id;

  return jsonb_build_object('lesson_id', p_lesson_id, 'status', 'completed');
end;
$$;
revoke execute on function public.complete_lesson(uuid, jsonb, jsonb) from anon;

create trigger set_updated_at before update on public.skills
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.skills enable row level security;
create policy "skills_member_read" on public.skills
  for select to authenticated using (tenant_id = public.get_tenant_id_from_jwt());
create policy "skills_admin_write" on public.skills
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
create policy "skills_super_admin" on public.skills
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.lesson_attendance enable row level security;
create policy "attendance_member_read" on public.lesson_attendance
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and (public.is_tenant_staff() or learner_id = public.current_learner_id())
  );
-- Writes happen via the complete_lesson RPC (SECURITY DEFINER); staff may also
-- correct rows directly.
create policy "attendance_staff_write" on public.lesson_attendance
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
create policy "attendance_super_admin" on public.lesson_attendance
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.evaluations enable row level security;
-- Learner/sponsor see non-internal evaluations; staff see all.
create policy "evaluations_learner_read" on public.evaluations
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and learner_id = public.current_learner_id()
    and is_internal = false
  );
create policy "evaluations_staff_read" on public.evaluations
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());
create policy "evaluations_staff_write" on public.evaluations
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'instructor', 'examiner')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'instructor', 'examiner')
    and public.tenant_is_writable()
  );
create policy "evaluations_super_admin" on public.evaluations
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

create trigger audit after insert or update or delete on public.evaluations
  for each row execute function public.audit_row();
