-- STAGING-ONLY DEMO SEED
-- This seed is for local development and staging environments only.
-- DO NOT USE IN PRODUCTION.
--
-- Creates one demo tenant ("Acme Driving School") with sample users across all
-- roles, learners, course packages, enrollments, lessons, invoices, and payments.
-- License categories are global (seeded by supabase/seed.sql) and referenced by
-- code, not (re)inserted here.

begin;

-- Demo tenant
insert into public.tenants (id, name, slug, status)
values ('00000000-0000-0000-0000-000000000001', 'Acme Driving School', 'acme-demo', 'active');

insert into public.tenant_settings (tenant_id)
values ('00000000-0000-0000-0000-000000000001');

-- Demo users per role
insert into public.users (id, tenant_id, role, status, full_name, phone)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'school_admin', 'active', 'Admin Demo', '+251911000101'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'instructor', 'active', 'Instructor Demo', '+251911000102'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'learner', 'active', 'Learner Demo', '+251911000103'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'receptionist', 'active', 'Receptionist Demo', '+251911000104'),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'accountant', 'active', 'Accountant Demo', '+251911000105');

-- Demo learners
insert into public.learners (id, tenant_id, user_id, full_name, phone)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'Learner Demo', '+251911000001'),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000001', null, 'Alice Johnson', '+251911000002'),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000001', null, 'Bob Smith', '+251911000003');

-- Demo branch (required for lessons)
insert into public.branches (id, tenant_id, name)
values ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000001', 'Main Branch');

-- Demo instructor
insert into public.instructors (id, tenant_id, full_name, phone)
values ('00000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000000001', 'Instructor Demo', '+251911100001');

-- Demo vehicle
insert into public.vehicles (id, tenant_id, plate_number, transmission, make, model)
values ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000001', 'AA-000-001', 'manual', 'Toyota', 'Corolla');

-- Demo course packages (license category codes are global — Proclamation 1074/2018)
insert into public.course_packages (id, tenant_id, license_category_code, name, total_hours, price)
values
  ('00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000000001', '3', 'Basic Automobile', 30, 9000),
  ('00000000-0000-0000-0000-000000004002', '00000000-0000-0000-0000-000000000001', '4-1', 'Public Transport I', 40, 12000),
  ('00000000-0000-0000-0000-000000004003', '00000000-0000-0000-0000-000000000001', '5-1', 'Truck Level I', 50, 15000);

-- Demo enrollments (various states)
insert into public.enrollments (id, tenant_id, learner_id, course_package_id, status, hours_total, hours_completed, price_at_enrollment)
values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000004001', 'active', 30, 0, 9000),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000004002', 'completed', 40, 40, 12000),
  ('00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000004001', 'cancelled', 30, 15, 9000);

-- Demo lessons (various states, non-overlapping windows for the one instructor)
insert into public.lessons (id, tenant_id, instructor_id, lesson_type, status, scheduled_start, scheduled_end)
values
  ('00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002101', 'practical', 'scheduled', now() + interval '1 day', now() + interval '1 day 1 hour'),
  ('00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002101', 'practical', 'confirmed', now() + interval '2 days', now() + interval '2 days 1 hour'),
  ('00000000-0000-0000-0000-000000006003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002101', 'practical', 'in_progress', now() - interval '2 hours', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000006004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002101', 'practical', 'completed', now() - interval '1 day', now() - interval '23 hours');

-- Demo lesson assignments
insert into public.lesson_assignments (id, tenant_id, lesson_id, learner_id)
values
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000007002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000001002'),
  ('00000000-0000-0000-0000-000000007003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000006004', '00000000-0000-0000-0000-000000001001');

-- Demo invoices (various states)
insert into public.invoices (id, tenant_id, learner_id, status, amount)
values
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001', 'issued', 9000),
  ('00000000-0000-0000-0000-000000008002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001002', 'partially_paid', 12000),
  ('00000000-0000-0000-0000-000000008003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001003', 'paid', 9000);

-- Demo payments
insert into public.payments (id, tenant_id, invoice_id, amount, method, status, idempotency_key, paid_at)
values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000008002', 6000, 'cash', 'succeeded', '00000000-0000-0000-0000-000000009001', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000008003', 9000, 'cash', 'succeeded', '00000000-0000-0000-0000-000000009002', now() - interval '5 days');

-- Demo refunds
insert into public.refunds (id, tenant_id, payment_id, invoice_id, amount, reason, method, status, requested_by, decided_by, decided_at)
values
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000008002', 1000, 'Partial lesson cancellation', 'cash', 'approved', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000105', now() - interval '1 day');

-- Enable all feature flags for the demo tenant
insert into public.feature_flag_overrides (tenant_id, flag_key, enabled)
values
  ('00000000-0000-0000-0000-000000000001', 'payments.chapa', true),
  ('00000000-0000-0000-0000-000000000001', 'payments.telebirr', true),
  ('00000000-0000-0000-0000-000000000001', 'payments.online_any', true),
  ('00000000-0000-0000-0000-000000000001', 'exams.mock_engine', true),
  ('00000000-0000-0000-0000-000000000001', 'portal.learner', true),
  ('00000000-0000-0000-0000-000000000001', 'portal.parent', true),
  ('00000000-0000-0000-0000-000000000001', 'pwa.offline_attendance', true),
  ('00000000-0000-0000-0000-000000000001', 'templates.designer_v2', true),
  ('00000000-0000-0000-0000-000000000001', 'certificates.public_verification', true),
  ('00000000-0000-0000-0000-000000000001', 'comms.sms', true),
  ('00000000-0000-0000-0000-000000000001', 'comms.email', true),
  ('00000000-0000-0000-0000-000000000001', 'comms.pause_all', false),
  ('00000000-0000-0000-0000-000000000001', 'registration.public_form', true),
  ('00000000-0000-0000-0000-000000000001', 'billing.enforce_limits', false),
  ('00000000-0000-0000-0000-000000000001', 'platform.maintenance_banner', false);

commit;
