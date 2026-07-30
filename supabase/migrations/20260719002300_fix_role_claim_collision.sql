-- Fix a second, more severe bug in the same hook (spec §6.3): the app role was
-- injected under the claim key "role", which collides with the JWT's own
-- top-level "role" claim — the one PostgREST reads (role_claim_key, default
-- ".role") to SET ROLE on the database connection for every request. Every
-- signed-in user's JWT had "role" overwritten from "authenticated" to their
-- app role (e.g. "super_admin", "school_admin", "learner" — none of which are
-- real Postgres roles), so PostgREST failed with
-- 22023 "role \"<app role>\" does not exist" on every single REST query for
-- every authenticated user. Confirmed live via direct REST call.
--
-- Fix: emit the app role under "user_role" instead, leaving the standard
-- "role": "authenticated" claim untouched. get_role_from_jwt() now reads
-- user_role; every RLS policy built on it (the whole app) picks this up
-- automatically since they all go through that one function.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb;
  v_user public.users%rowtype;
  v_tenant_status text;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  select * into v_user
  from public.users
  where auth_user_id = (event ->> 'user_id')::uuid
  limit 1;

  if not found then
    -- No application user row yet (e.g. pre-provisioning): pass through.
    return event;
  end if;

  select status::text into v_tenant_status
  from public.tenants
  where id = v_user.tenant_id;

  claims := claims
    || jsonb_build_object(
      'user_id', v_user.id,
      'tenant_id', v_user.tenant_id,
      'user_role', v_user.role,
      'branch_id', v_user.branch_id,
      'user_status', v_user.status,
      'tenant_status', coalesce(v_tenant_status, 'active'),
      'locale', v_user.locale
    );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

create or replace function public.get_role_from_jwt()
returns text
language sql stable
as $$
  select public.jwt_claims() ->> 'user_role'
$$;
