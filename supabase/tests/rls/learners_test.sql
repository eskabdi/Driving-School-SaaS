-- RLS test harness (spec §6.6) — representative coverage for public.learners.
-- Run with: supabase test db
--
-- Establishes the pattern every table's test file follows: seed a two-tenant
-- fixture as the superuser (bypassing RLS), then switch to the `authenticated`
-- role and simulate each actor by setting request.jwt.claims — the same claims
-- the JWT helpers (get_tenant_id_from_jwt, get_role_from_jwt, …) read.

begin;
select plan(4);

-- ---------------------------------------------------------------------------
-- Fixture (as superuser — RLS not yet in effect for this role)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name, slug, status) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b', 'active');

insert into public.users (id, tenant_id, role, status, full_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'school_admin', 'active', 'Admin A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'school_admin', 'active', 'Admin B');

insert into public.learners (id, tenant_id, full_name) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Learner A1'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Learner B1');

-- Helper: build a claims JSON for a given tenant/role/user.
-- (Inlined per assertion below for clarity.)

-- ---------------------------------------------------------------------------
-- Tenant A school_admin: sees only Tenant A's learner
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"11111111-1111-1111-1111-111111111111","user_id":"aaaaaaaa-0000-0000-0000-000000000001","user_role":"school_admin","tenant_status":"active","user_status":"active"}',
  true
);

select is(
  (select count(*) from public.learners),
  1::bigint,
  'school_admin sees exactly one learner (their own tenant)'
);
select is(
  (select count(*) from public.learners where tenant_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'cross-tenant learners are invisible'
);

-- ---------------------------------------------------------------------------
-- Write-block under a suspended tenant (spec §2.1)
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"11111111-1111-1111-1111-111111111111","user_id":"aaaaaaaa-0000-0000-0000-000000000001","user_role":"school_admin","tenant_status":"suspended","user_status":"active"}',
  true
);
select throws_ok(
  $$insert into public.learners (tenant_id, full_name)
     values ('11111111-1111-1111-1111-111111111111', 'Should Fail')$$,
  '42501',
  null,
  'writes are blocked while the tenant is suspended'
);

-- ---------------------------------------------------------------------------
-- Tenant B school_admin: sees only Tenant B's learner
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"22222222-2222-2222-2222-222222222222","user_id":"bbbbbbbb-0000-0000-0000-000000000001","user_role":"school_admin","tenant_status":"active","user_status":"active"}',
  true
);
select is(
  (select count(*) from public.learners),
  1::bigint,
  'the other tenant likewise sees only its own learner'
);

select * from finish();
rollback;
