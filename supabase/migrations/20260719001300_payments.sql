-- Billing: payments + invoice status recompute (blueprint §2 module 9; spec §2.7)
--
-- The cash path is implemented here; provider paths (Chapa/Telebirr) attach the
-- same payments table and apply_payment RPC behind feature flags later.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'cheque', 'chapa', 'telebirr')),
  status payment_status not null default 'succeeded',
  provider text,
  provider_ref text,
  idempotency_key text unique,
  received_by uuid references public.users(id),
  paid_at timestamptz not null default now(),
  receipt_number text,
  receipt_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payments (tenant_id, invoice_id);
create index on public.payments (tenant_id, paid_at desc);

-- ---------------------------------------------------------------------------
-- apply_payment RPC (spec §2.7): records a succeeded payment against an invoice
-- and recomputes invoice status from the sum of succeeded payments, activating a
-- pending_payment enrollment once >= min_activation_pct of the invoice is paid.
-- SECURITY DEFINER; called by the record-payment Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_idempotency_key text,
  p_receipt_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_total numeric;
  v_paid numeric;
  v_enrollment uuid;
  v_actor uuid := public.get_user_id_from_jwt();
  v_min_pct int;
  v_payment_id uuid;
  v_new_status invoice_status;
begin
  -- Idempotency: a repeated key returns the original payment, no double-charge.
  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key;
  if v_payment_id is not null then
    return jsonb_build_object('payment_id', v_payment_id, 'idempotent', true);
  end if;

  select tenant_id, amount, enrollment_id into v_tenant, v_total, v_enrollment
  from public.invoices where id = p_invoice_id;
  if v_tenant is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_tenant <> public.get_tenant_id_from_jwt() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  insert into public.payments
    (tenant_id, invoice_id, amount, method, status, idempotency_key, received_by, receipt_number)
  values
    (v_tenant, p_invoice_id, p_amount, p_method, 'succeeded', p_idempotency_key, v_actor, p_receipt_number)
  returning id into v_payment_id;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments where invoice_id = p_invoice_id and status = 'succeeded';

  v_new_status := case
    when v_paid >= v_total then 'paid'::invoice_status
    when v_paid > 0 then 'partially_paid'::invoice_status
    else 'issued'::invoice_status
  end;

  update public.invoices set status = v_new_status where id = p_invoice_id;

  -- Activate the enrollment once the activation threshold is met (spec §2.4).
  if v_enrollment is not null then
    select coalesce(min_activation_pct, 25) into v_min_pct
    from public.tenant_settings where tenant_id = v_tenant;

    if v_total > 0 and (v_paid / v_total) * 100 >= v_min_pct then
      update public.enrollments
        set status = 'active'
      where id = v_enrollment and status = 'pending_payment';
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'invoice_status', v_new_status,
    'total_paid', v_paid
  );
end;
$$;
revoke execute on function public.apply_payment(uuid, numeric, text, text, text) from anon;

create trigger set_updated_at before update on public.payments
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;

create policy "payments_self_read" on public.payments
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id and i.learner_id = public.current_learner_id()
    )
  );

create policy "payments_staff_read" on public.payments
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

-- Direct writes are restricted; payments are created via apply_payment RPC.
create policy "payments_super_admin" on public.payments
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- Audit every payment (blueprint §10).
create trigger audit after insert or update or delete on public.payments
  for each row execute function public.audit_row();
