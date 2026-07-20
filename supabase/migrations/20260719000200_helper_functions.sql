-- JWT claim helpers + shared triggers (blueprint §5, §9; spec §2.1)
--
-- The custom access-token hook injects tenant_id, user_id, role, branch_id,
-- user_status and tenant_status into the JWT (spec §6.3). These STABLE helpers
-- read only from the JWT claims so RLS policies never hit a table hotspot.

-- Raw claims accessor.
create or replace function public.jwt_claims()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

create or replace function public.get_tenant_id_from_jwt()
returns uuid
language sql stable
as $$
  select nullif(public.jwt_claims() ->> 'tenant_id', '')::uuid
$$;

create or replace function public.get_user_id_from_jwt()
returns uuid
language sql stable
as $$
  select nullif(public.jwt_claims() ->> 'user_id', '')::uuid
$$;

create or replace function public.get_role_from_jwt()
returns text
language sql stable
as $$
  select public.jwt_claims() ->> 'role'
$$;

create or replace function public.get_branch_id_from_jwt()
returns uuid
language sql stable
as $$
  select nullif(public.jwt_claims() ->> 'branch_id', '')::uuid
$$;

create or replace function public.get_user_status_from_jwt()
returns text
language sql stable
as $$
  select public.jwt_claims() ->> 'user_status'
$$;

create or replace function public.get_tenant_status_from_jwt()
returns text
language sql stable
as $$
  select public.jwt_claims() ->> 'tenant_status'
$$;

create or replace function public.is_super_admin_from_jwt()
returns boolean
language sql stable
as $$
  select coalesce(public.get_role_from_jwt() = 'super_admin', false)
$$;

-- Central write-block predicate (spec §2.1). AND-ed into every tenant write
-- policy: suspended/offboarding/archived tenants are read-only.
create or replace function public.tenant_is_writable()
returns boolean
language sql stable
as $$
  select coalesce(public.get_tenant_status_from_jwt() in ('trial','active','past_due'), false)
$$;

-- Generic updated_at maintenance trigger (spec §1.1).
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Generic audit trigger (blueprint §10). Writes before/after row images.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (tenant_id, actor_user_id, table_name, action, row_before, row_after)
  values (
    coalesce((case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end), null),
    public.get_user_id_from_jwt(),
    tg_table_name,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end
$$;
