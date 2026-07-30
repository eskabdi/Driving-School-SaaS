-- Status transition guard (spec §2, preamble)
--
-- "Any transition not listed is forbidden and must be rejected server-side (DB
-- trigger enforce_status_transition(table, from, to) driven by a
-- status_transitions reference table — the same guard table serves all
-- workflows and is seeded from the matrices below)."
--
-- Until now each workflow only rejected the cases someone hand-coded (e.g.
-- complete_lesson checking LESSON_ALREADY_COMPLETED). Everything else — a
-- cancelled lesson jumping back to scheduled, a refunded invoice going to paid,
-- an archived tenant reactivating — was accepted by the database. This closes
-- that: one table of legal edges, one trigger, attached to every stateful table.

create table public.status_transitions (
  entity text not null,
  from_status text not null,
  to_status text not null,
  primary key (entity, from_status, to_status)
);

comment on table public.status_transitions is
  'Legal status edges per entity (spec §2). Rows are the whitelist; anything absent is rejected by enforce_status_transition().';

-- Generic guard. Reads the entity name from the trigger argument and compares
-- the row''s status before/after via jsonb, so one function serves every table
-- regardless of which status enum the column uses.
create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
as $$
declare
  v_entity text := tg_argv[0];
  v_from text := to_jsonb(old) ->> 'status';
  v_to text := to_jsonb(new) ->> 'status';
begin
  -- Inserts, unchanged status, and null statuses are not transitions.
  if v_from is null or v_to is null or v_from = v_to then
    return new;
  end if;

  if not exists (
    select 1 from public.status_transitions st
    where st.entity = v_entity
      and st.from_status = v_from
      and st.to_status = v_to
  ) then
    raise exception 'INVALID_STATUS_TRANSITION: % cannot move from % to %',
      v_entity, v_from, v_to
      using errcode = 'P0001',
            hint = 'See public.status_transitions for the legal edges.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed the matrices from spec §2
-- ---------------------------------------------------------------------------
insert into public.status_transitions (entity, from_status, to_status) values
  -- §2.1 tenant lifecycle
  ('tenants','trial','active'),
  ('tenants','trial','archived'),
  ('tenants','active','past_due'),
  ('tenants','past_due','active'),
  ('tenants','past_due','suspended'),
  ('tenants','active','suspended'),
  ('tenants','suspended','active'),
  ('tenants','suspended','offboarding'),
  ('tenants','active','offboarding'),
  ('tenants','offboarding','archived'),

  -- §2.3 public registration
  ('public_registration_submissions','submitted','under_review'),
  ('public_registration_submissions','submitted','rejected'),
  ('public_registration_submissions','under_review','approved'),
  ('public_registration_submissions','under_review','rejected'),
  ('public_registration_submissions','approved','converted'),
  ('public_registration_submissions','submitted','expired'),
  ('public_registration_submissions','under_review','expired'),
  ('public_registration_submissions','approved','expired'),

  -- §2.4 enrollment
  ('enrollments','pending_payment','active'),
  ('enrollments','pending_payment','cancelled'),
  ('enrollments','active','on_hold'),
  ('enrollments','on_hold','active'),
  ('enrollments','active','completed'),
  ('enrollments','active','expired'),
  ('enrollments','active','cancelled'),
  ('enrollments','on_hold','cancelled'),
  ('enrollments','on_hold','expired'),

  -- §2.5 lesson
  ('lessons','draft','scheduled'),
  ('lessons','draft','cancelled'),
  ('lessons','scheduled','confirmed'),
  ('lessons','scheduled','in_progress'),
  ('lessons','confirmed','in_progress'),
  ('lessons','in_progress','completed'),
  -- an instructor may complete straight from scheduled/confirmed without
  -- having pressed "start" first
  ('lessons','scheduled','completed'),
  ('lessons','confirmed','completed'),
  ('lessons','scheduled','cancelled'),
  ('lessons','confirmed','cancelled'),
  ('lessons','scheduled','no_show'),
  ('lessons','confirmed','no_show'),

  -- §2.7.1 invoice
  ('invoices','draft','issued'),
  ('invoices','draft','void'),
  ('invoices','issued','partially_paid'),
  ('invoices','issued','paid'),
  ('invoices','issued','overdue'),
  ('invoices','issued','void'),
  ('invoices','partially_paid','paid'),
  ('invoices','partially_paid','overdue'),
  ('invoices','overdue','partially_paid'),
  ('invoices','overdue','paid'),
  ('invoices','paid','refunded'),

  -- §2.7.2 payment
  ('payments','initiated','pending_provider'),
  ('payments','initiated','failed'),
  ('payments','pending_provider','succeeded'),
  ('payments','pending_provider','failed'),
  ('payments','pending_provider','expired'),
  ('payments','succeeded','reversed'),

  -- §2.7.4 refund
  ('refunds','requested','approved'),
  ('refunds','requested','rejected'),
  ('refunds','approved','processing'),
  ('refunds','approved','completed'),
  ('refunds','processing','completed'),
  ('refunds','processing','failed'),
  ('refunds','failed','processing'),

  -- §2.11 certificate
  ('certificates','active','revoked'),
  ('certificates','active','expired'),

  -- §2.11 ID card
  ('id_cards','draft','active'),
  ('id_cards','active','expired'),
  ('id_cards','active','lost'),
  ('id_cards','active','replaced'),
  ('id_cards','active','revoked'),
  ('id_cards','lost','replaced'),
  ('id_cards','lost','revoked')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Attach the guard
-- ---------------------------------------------------------------------------
create trigger enforce_status before update on public.tenants
  for each row execute function public.enforce_status_transition('tenants');
create trigger enforce_status before update on public.public_registration_submissions
  for each row execute function public.enforce_status_transition('public_registration_submissions');
create trigger enforce_status before update on public.enrollments
  for each row execute function public.enforce_status_transition('enrollments');
create trigger enforce_status before update on public.lessons
  for each row execute function public.enforce_status_transition('lessons');
create trigger enforce_status before update on public.invoices
  for each row execute function public.enforce_status_transition('invoices');
create trigger enforce_status before update on public.payments
  for each row execute function public.enforce_status_transition('payments');
create trigger enforce_status before update on public.refunds
  for each row execute function public.enforce_status_transition('refunds');
create trigger enforce_status before update on public.certificates
  for each row execute function public.enforce_status_transition('certificates');
create trigger enforce_status before update on public.id_cards
  for each row execute function public.enforce_status_transition('id_cards');

-- ---------------------------------------------------------------------------
-- RLS: readable by any authenticated user (the UI shows legal next states);
-- only super_admin may edit the matrix.
-- ---------------------------------------------------------------------------
alter table public.status_transitions enable row level security;

create policy "status_transitions_read" on public.status_transitions
  for select to authenticated using (true);

create policy "status_transitions_super_admin" on public.status_transitions
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());
