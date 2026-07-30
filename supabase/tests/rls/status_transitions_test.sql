-- Status transition guard (spec §2 preamble, migration 20260719001900).
-- Asserts the whitelist actually rejects illegal edges — the guard is worthless
-- if a typo in the seed silently allows everything.

begin;
select plan(8);

-- Fixture -------------------------------------------------------------------
insert into public.tenants (id, name, slug, status) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a', 'active');
insert into public.tenant_settings (tenant_id) values
  ('11111111-1111-1111-1111-111111111111');
insert into public.branches (id, tenant_id, name) values
  ('bbbbbbbb-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Main');
insert into public.instructors (id, tenant_id, full_name) values
  ('cccccccc-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Ins A');
insert into public.learners (id, tenant_id, full_name) values
  ('dddddddd-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Learner A');
insert into public.lessons (id, tenant_id, instructor_id, lesson_type, status, scheduled_start, scheduled_end)
values ('eeeeeeee-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',
        'cccccccc-1111-1111-1111-111111111111','practical','scheduled',
        now() + interval '1 day', now() + interval '1 day 1 hour');

-- The matrix is populated ---------------------------------------------------
select ok(
  (select count(*) from public.status_transitions) > 50,
  'status_transitions is seeded with the spec matrices'
);
select ok(
  exists (select 1 from public.status_transitions
           where entity='lessons' and from_status='scheduled' and to_status='completed'),
  'a legal lesson edge is present'
);

-- Legal transitions succeed --------------------------------------------------
select lives_ok(
  $$update public.lessons set status='confirmed'
     where id='eeeeeeee-1111-1111-1111-111111111111'$$,
  'scheduled -> confirmed is allowed'
);
select lives_ok(
  $$update public.lessons set status='in_progress'
     where id='eeeeeeee-1111-1111-1111-111111111111'$$,
  'confirmed -> in_progress is allowed'
);
select lives_ok(
  $$update public.lessons set status='completed'
     where id='eeeeeeee-1111-1111-1111-111111111111'$$,
  'in_progress -> completed is allowed'
);

-- Illegal transitions are rejected -------------------------------------------
select throws_ok(
  $$update public.lessons set status='scheduled'
     where id='eeeeeeee-1111-1111-1111-111111111111'$$,
  'P0001',
  null,
  'completed -> scheduled is rejected (no resurrecting a finished lesson)'
);

-- Enrollment: cancelled is terminal
insert into public.course_packages (id, tenant_id, license_category_code, name, total_hours, price)
values ('ffffffff-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','3','Basic',30,9000);
insert into public.enrollments (id, tenant_id, learner_id, course_package_id, status, hours_total, price_at_enrollment)
values ('a0000000-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',
        'dddddddd-1111-1111-1111-111111111111','ffffffff-1111-1111-1111-111111111111',
        'cancelled',30,9000);
select throws_ok(
  $$update public.enrollments set status='active'
     where id='a0000000-1111-1111-1111-111111111111'$$,
  'P0001',
  null,
  'cancelled -> active is rejected (cancellation is terminal)'
);

-- A no-op update must not trip the guard
select lives_ok(
  $$update public.lessons set notes='touched'
     where id='eeeeeeee-1111-1111-1111-111111111111'$$,
  'updating a non-status column on a completed row is still allowed'
);

select * from finish();
rollback;
