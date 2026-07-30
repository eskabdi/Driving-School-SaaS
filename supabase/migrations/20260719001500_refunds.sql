-- Refunds (blueprint §2 module 9; spec §1.3.7, §2.7.4)
--
-- Flow: requested → approved → processing → completed; requested → rejected;
-- processing → failed → processing. A refund's amount can never exceed the
-- payment's remaining refundable balance (enforced by trigger).

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  payment_id uuid not null references public.payments(id),
  invoice_id uuid not null references public.invoices(id),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  method text not null check (method in ('cash', 'bank_transfer', 'provider_reversal')),
  status refund_status not null default 'requested',
  requested_by uuid not null references public.users(id),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.refunds (tenant_id, status);
create index on public.refunds (tenant_id, payment_id);

-- Enforce: sum of a payment's non-terminal + completed refunds never exceeds the
-- payment amount (spec §2.7.4).
create or replace function public.enforce_refund_balance()
returns trigger
language plpgsql
as $$
declare
  v_payment_amount numeric;
  v_already numeric;
begin
  select amount into v_payment_amount from public.payments where id = new.payment_id;
  select coalesce(sum(amount), 0) into v_already
  from public.refunds
  where payment_id = new.payment_id
    and status not in ('rejected', 'failed')
    and id <> new.id;

  if new.amount + v_already > v_payment_amount + 0.001 then
    raise exception 'REFUND_EXCEEDS_BALANCE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger enforce_refund_balance
  before insert or update on public.refunds
  for each row execute function public.enforce_refund_balance();

-- When a refund completes and covers the full invoice, mark the invoice refunded.
create or replace function public.on_refund_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_total numeric;
  v_refunded numeric;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select amount into v_invoice_total from public.invoices where id = new.invoice_id;
    select coalesce(sum(amount), 0) into v_refunded
    from public.refunds where invoice_id = new.invoice_id and status = 'completed';
    if v_refunded >= v_invoice_total then
      update public.invoices set status = 'refunded' where id = new.invoice_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger on_refund_completed
  after update on public.refunds
  for each row execute function public.on_refund_completed();

create trigger set_updated_at before update on public.refunds
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — reads for finance staff; writes via Edge Functions (four-eyes).
-- ---------------------------------------------------------------------------
alter table public.refunds enable row level security;

create policy "refunds_staff_read" on public.refunds
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'accountant', 'branch_manager')
  );

create policy "refunds_super_admin" on public.refunds
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

create trigger audit after insert or update or delete on public.refunds
  for each row execute function public.audit_row();
