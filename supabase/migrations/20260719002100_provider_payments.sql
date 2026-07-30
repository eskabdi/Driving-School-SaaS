-- Provider payment settlement (spec §2.7.2)
--
-- apply_payment() reads the actor and tenant from the caller's JWT, which is
-- right for the cash path (a receptionist is logged in) but wrong for a webhook:
-- the provider calls us with no user context. This RPC takes the payment row as
-- the source of truth for the tenant and performs the same settlement.

create or replace function public.settle_provider_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_provider_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_invoice uuid;
  v_expected numeric;
  v_status payment_status;
  v_total numeric;
  v_paid numeric;
  v_enrollment uuid;
  v_min_pct int;
  v_new_status invoice_status;
begin
  select tenant_id, invoice_id, amount, status
    into v_tenant, v_invoice, v_expected, v_status
  from public.payments where id = p_payment_id;

  if v_tenant is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempotent: a replayed webhook for an already-settled payment is a no-op.
  if v_status = 'succeeded' then
    return jsonb_build_object('payment_id', p_payment_id, 'already_settled', true);
  end if;

  -- Amount mismatch is a hard failure, not a silent accept (spec §2.7.2).
  if p_amount is distinct from v_expected then
    update public.payments
       set status = 'failed', provider_ref = p_provider_ref
     where id = p_payment_id;
    raise exception 'PAYMENT_AMOUNT_MISMATCH: expected %, provider sent %', v_expected, p_amount
      using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'succeeded', provider_ref = p_provider_ref, paid_at = now()
   where id = p_payment_id;

  select amount, enrollment_id into v_total, v_enrollment
  from public.invoices where id = v_invoice;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments where invoice_id = v_invoice and status = 'succeeded';

  v_new_status := case
    when v_paid >= v_total then 'paid'::invoice_status
    when v_paid > 0 then 'partially_paid'::invoice_status
    else 'issued'::invoice_status
  end;
  update public.invoices set status = v_new_status where id = v_invoice;

  if v_enrollment is not null then
    select coalesce(min_activation_pct, 25) into v_min_pct
    from public.tenant_settings where tenant_id = v_tenant;

    if v_total > 0 and (v_paid / v_total) * 100 >= v_min_pct then
      update public.enrollments set status = 'active'
       where id = v_enrollment and status = 'pending_payment';
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'invoice_status', v_new_status,
    'total_paid', v_paid
  );
end;
$$;
revoke execute on function public.settle_provider_payment(uuid, numeric, text) from anon, authenticated;
