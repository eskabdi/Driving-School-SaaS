-- RLS coverage for public.payments (spec §6.6) — a table nothing exercised yet.
-- Asserts cross-tenant isolation and that the learner-self-read policy actually
-- resolves through invoices.learner_id, not just "any authenticated user".

begin;
select plan(4);

insert into public.tenants (id, name, slug, status) values
  ('11111111-2222-2222-2222-222222222222', 'Tenant A', 'tenant-pay-a', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-pay-b', 'active');

insert into public.users (id, tenant_id, role, status, full_name) values
  ('aaaaaaaa-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222', 'school_admin', 'active', 'Admin A'),
  ('bbbbbbbb-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222', 'learner', 'active', 'Learner A');

insert into public.learners (id, tenant_id, user_id, full_name) values
  ('cccccccc-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222',
   'bbbbbbbb-2222-2222-2222-222222222222', 'Learner A');

insert into public.invoices (id, tenant_id, learner_id, status, amount) values
  ('dddddddd-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222',
   'cccccccc-2222-2222-2222-222222222222', 'issued', 5000);

insert into public.payments (id, tenant_id, invoice_id, amount, method, status) values
  ('eeeeeeee-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222',
   'dddddddd-2222-2222-2222-222222222222', 5000, 'cash', 'succeeded');

-- Staff sees the payment.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"tenant_id":"11111111-2222-2222-2222-222222222222","user_id":"aaaaaaaa-2222-2222-2222-222222222222","user_role":"school_admin","tenant_status":"active","user_status":"active"}',
  true);
select is((select count(*) from public.payments)::bigint, 1::bigint,
  'school_admin sees the payment on their tenant''s invoice');

-- The learner who owns the invoice sees their own payment.
select set_config('request.jwt.claims',
  '{"tenant_id":"11111111-2222-2222-2222-222222222222","user_id":"bbbbbbbb-2222-2222-2222-222222222222","user_role":"learner","tenant_status":"active","user_status":"active"}',
  true);
select is((select count(*) from public.payments)::bigint, 1::bigint,
  'the invoice''s own learner sees their payment');

-- A different learner in the same tenant sees nothing.
insert into public.users (id, tenant_id, role, status, full_name) values
  ('ffffffff-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222', 'learner', 'active', 'Learner Other');
insert into public.learners (id, tenant_id, user_id, full_name) values
  ('a0000000-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222',
   'ffffffff-2222-2222-2222-222222222222', 'Learner Other');
select set_config('request.jwt.claims',
  '{"tenant_id":"11111111-2222-2222-2222-222222222222","user_id":"ffffffff-2222-2222-2222-222222222222","user_role":"learner","tenant_status":"active","user_status":"active"}',
  true);
select is((select count(*) from public.payments)::bigint, 0::bigint,
  'a learner who does not own the invoice sees no payments');

-- Cross-tenant staff sees nothing.
select set_config('request.jwt.claims',
  '{"tenant_id":"22222222-2222-2222-2222-222222222222","user_id":"aaaaaaaa-2222-2222-2222-222222222222","user_role":"school_admin","tenant_status":"active","user_status":"active"}',
  true);
select is((select count(*) from public.payments)::bigint, 0::bigint,
  'the other tenant''s school_admin sees no payments');

select * from finish();
rollback;
