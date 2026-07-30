-- RLS + verify_certificate coverage (spec §2.11-§2.12).
-- Asserts the public verify path never leaks tenant-scoped table access, and
-- that revocation is visible through the same minimal payload.

begin;
select plan(6);

insert into public.tenants (id, name, slug, status) values
  ('11111111-3333-3333-3333-333333333333', 'Tenant A', 'tenant-cert-a', 'active');
insert into public.users (id, tenant_id, role, status, full_name) values
  ('aaaaaaaa-3333-3333-3333-333333333333', '11111111-3333-3333-3333-333333333333', 'learner', 'active', 'Learner A');
insert into public.learners (id, tenant_id, user_id, full_name) values
  ('bbbbbbbb-3333-3333-3333-333333333333', '11111111-3333-3333-3333-333333333333',
   'aaaaaaaa-3333-3333-3333-333333333333', 'Kebede Alemu');
insert into public.certificates
  (id, tenant_id, learner_id, certificate_type, verification_code, serial_number, status)
values
  ('cccccccc-3333-3333-3333-333333333333', '11111111-3333-3333-3333-333333333333',
   'bbbbbbbb-3333-3333-3333-333333333333', 'course_completion', 'ABCD1234WXYZ', 'C-2018-000001', 'active');

-- verify_certificate is callable by anon and returns the minimal payload.
set local role anon;
select is(
  (public.verify_certificate('ABCD1234WXYZ') ->> 'status'),
  'valid',
  'anon can verify an active certificate and gets status=valid'
);
select is(
  (public.verify_certificate('ABCD1234WXYZ') ->> 'holder_initial'),
  'K',
  'the payload exposes only the holder initial, never the full name'
);
select ok(
  not (public.verify_certificate('ABCD1234WXYZ') ? 'full_name')
  and not (public.verify_certificate('ABCD1234WXYZ') ? 'phone'),
  'the payload never includes full_name or phone'
);
select is(
  (public.verify_certificate('does-not-exist') ->> 'status'),
  'not_found',
  'an unknown code returns not_found, not an error'
);

-- anon cannot read the certificates table directly (only the function bypasses RLS).
select is((select count(*) from public.certificates)::bigint, 0::bigint,
  'anon has no direct row access to certificates');

-- Revocation flips the verify result.
reset role;
update public.certificates set status = 'revoked', revoked_reason = 'test'
 where id = 'cccccccc-3333-3333-3333-333333333333';
set local role anon;
select is(
  (public.verify_certificate('ABCD1234WXYZ') ->> 'status'),
  'revoked',
  'a revoked certificate reports status=revoked through the same endpoint'
);

select * from finish();
rollback;
