-- Custom access-token hook (blueprint §4; spec §6.3)
--
-- Injects tenant_id, user_id, role, branch_id, user_status and tenant_status
-- into every minted JWT by reading public.users (+ tenants.status). Claims are
-- therefore <= jwt_expiry stale; disable/suspend/role-change also enforce a
-- server-side DB check and can force a global sign-out to close the gap.
--
-- Enable in the dashboard (Authentication → Hooks → Access token) or config:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/custom_access_token_hook"

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
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

-- Grant the auth admin role permission to run the hook.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;
grant select on public.tenants to supabase_auth_admin;
