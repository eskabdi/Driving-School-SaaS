-- Fix custom_access_token_hook to actually run (spec §6.3, blueprint §4).
--
-- Bug: the hook was declared without SECURITY DEFINER. supabase_auth_admin
-- (the role GoTrue uses to invoke pg-functions:// hooks) does not have
-- BYPASSRLS, and RLS is enabled on public.users/public.tenants, so the
-- function's own SELECT was silently filtered to zero rows by RLS at call
-- time. That hit the "not found" branch and passed the event through
-- unchanged — every JWT was minted with no tenant_id/role/etc, so every RLS
-- policy evaluated false and the app looked "empty but logged in" for every
-- signed-in user, including super_admin. Confirmed live: calling the
-- function directly as postgres (which bypasses RLS) returned correct
-- claims, but real sign-ins never got them.
--
-- Fix: SECURITY DEFINER + a pinned search_path (required whenever a
-- SECURITY DEFINER function is not schema-qualified everywhere, to avoid
-- search_path hijacking).

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
      'role', v_user.role,
      'branch_id', v_user.branch_id,
      'user_status', v_user.status,
      'tenant_status', coalesce(v_tenant_status, 'active'),
      'locale', v_user.locale
    );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;
grant select on public.tenants to supabase_auth_admin;

-- Revoke from PUBLIC — a SECURITY DEFINER function should only be callable
-- by the roles that need it, not any authenticated/anon caller.
revoke execute on function public.custom_access_token_hook(jsonb) from public;
