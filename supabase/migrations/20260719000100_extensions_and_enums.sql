-- Extensions & enums (blueprint §7, spec §1.1)
-- All statuses are Postgres enums so invalid states are unrepresentable and
-- PostgREST exposes them in generated types.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- Lifecycle / status enums (spec §1.1)
create type enrollment_status   as enum ('pending_payment','active','on_hold','completed','expired','cancelled');
create type lesson_status       as enum ('draft','scheduled','confirmed','in_progress','completed','cancelled','no_show');
create type invoice_status      as enum ('draft','issued','partially_paid','paid','overdue','void','refunded');
create type payment_status      as enum ('initiated','pending_provider','succeeded','failed','expired','reversed');
create type refund_status       as enum ('requested','approved','rejected','processing','completed','failed');
create type vehicle_status      as enum ('active','in_maintenance','out_of_service','retired');
create type card_status         as enum ('draft','active','lost','replaced','expired','revoked');
create type certificate_status  as enum ('active','revoked','expired');
create type print_job_status    as enum ('queued','rendering','ready','printing','completed','failed','cancelled');
create type submission_status   as enum ('submitted','under_review','approved','rejected','converted','expired');
create type template_status     as enum ('draft','published','archived');
create type tenant_status       as enum ('trial','active','past_due','suspended','offboarding','archived');
create type user_status         as enum ('invited','active','disabled');
create type invitation_status   as enum ('pending','accepted','expired','revoked');
create type notification_status as enum ('queued','sending','sent','delivered','failed','cancelled');
create type maintenance_status  as enum ('scheduled','in_progress','completed','overdue','cancelled');
create type exam_attempt_status as enum ('in_progress','submitted','graded','voided');

-- Application role (mirrors src/lib/roles.ts)
create type app_role as enum (
  'super_admin','school_admin','branch_manager','accountant',
  'receptionist','instructor','examiner','learner','parent'
);
