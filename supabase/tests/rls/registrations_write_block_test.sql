-- Write-block under a suspended tenant (spec §2.1) + the duplicate-active-phone
-- constraint (spec §2.3/G26), exercised on public_registration_submissions
-- since learners_test.sql already covers the pattern on a simpler table.

begin;
select plan(4);

insert into public.tenants (id, name, slug, status) values
  ('11111111-4444-4444-4444-444444444444', 'Tenant A', 'tenant-reg-a', 'active');
insert into public.users (id, tenant_id, role, status, full_name) values
  ('aaaaaaaa-4444-4444-4444-444444444444', '11111111-4444-4444-4444-444444444444', 'receptionist', 'active', 'Front Desk');

insert into public.public_registration_submissions (id, tenant_id, full_name, phone, status)
values ('bbbbbbbb-4444-4444-4444-444444444444', '11111111-4444-4444-4444-444444444444',
        'Applicant One', '+251911000001', 'submitted');

-- A second active submission for the same phone in the same tenant is rejected
-- by the partial unique index (spec §2.3), independent of RLS.
select throws_ok(
  $$insert into public.public_registration_submissions (tenant_id, full_name, phone, status)
     values ('11111111-4444-4444-4444-444444444444', 'Applicant Duplicate', '+251911000001', 'under_review')$$,
  '23505',
  null,
  'a second active submission for the same phone is rejected'
);

-- A rejected/expired submission does NOT block a new one for the same phone.
update public.public_registration_submissions set status = 'rejected'
 where id = 'bbbbbbbb-4444-4444-4444-444444444444';
select lives_ok(
  $$insert into public.public_registration_submissions (tenant_id, full_name, phone, status)
     values ('11111111-4444-4444-4444-444444444444', 'Applicant Retry', '+251911000001', 'submitted')$$,
  'a new submission for the same phone is allowed once the prior one is terminal'
);

-- Receptionist can normally update a submission...
set local role authenticated;
select set_config('request.jwt.claims',
  '{"tenant_id":"11111111-4444-4444-4444-444444444444","user_id":"aaaaaaaa-4444-4444-4444-444444444444","user_role":"receptionist","tenant_status":"active","user_status":"active"}',
  true);
select lives_ok(
  $$update public.public_registration_submissions set status='under_review'
     where full_name='Applicant Retry'$$,
  'receptionist can update a submission while the tenant is active'
);

-- ...but not once the tenant is suspended (spec §2.1 write-block).
select set_config('request.jwt.claims',
  '{"tenant_id":"11111111-4444-4444-4444-444444444444","user_id":"aaaaaaaa-4444-4444-4444-444444444444","user_role":"receptionist","tenant_status":"suspended","user_status":"active"}',
  true);
select throws_ok(
  $$update public.public_registration_submissions set status='approved'
     where full_name='Applicant Retry'$$,
  '42501',
  null,
  'writes are blocked once the tenant is suspended, even for a receptionist'
);

select * from finish();
rollback;
