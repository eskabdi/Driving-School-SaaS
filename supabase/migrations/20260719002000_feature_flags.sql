-- Feature flags (spec §4A) + payment webhook dedupe (spec §2.7.2)
--
-- Blueprint v1 named a feature_flags table but nothing defined, populated, or
-- consumed it (gap G13). This creates the catalog, a per-tenant override layer,
-- and a resolver the SPA and Edge Functions both call.

create table public.feature_flags (
  key text primary key,
  description text not null,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-tenant override; tenant_id null would be platform-wide, but the platform
-- default already lives on feature_flags.default_enabled, so overrides are
-- always tenant-scoped.
create table public.feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.feature_flags(key) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flag_key, tenant_id)
);
create index on public.feature_flag_overrides (tenant_id);

/** Resolve a flag for a tenant: override wins, else the platform default. */
create or replace function public.feature_enabled(p_key text, p_tenant uuid default null)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select o.enabled
       from public.feature_flag_overrides o
      where o.flag_key = p_key
        and o.tenant_id = coalesce(p_tenant, public.get_tenant_id_from_jwt())),
    (select f.default_enabled from public.feature_flags f where f.key = p_key),
    false
  )
$$;

-- Catalog from spec §4A.
insert into public.feature_flags (key, description, default_enabled) values
  ('payments.chapa',                  'Chapa provider buttons + initiate-payment path', false),
  ('payments.telebirr',               'Telebirr provider buttons + initiate-payment path', false),
  ('payments.online_any',             'Entire online-payment UI (off = cash-only mode)', false),
  ('exams.mock_engine',               'Mock exam module routes', false),
  ('portal.learner',                  'Learner portal login', true),
  ('portal.parent',                   'Parent/sponsor portal login', false),
  ('pwa.offline_attendance',          'Service-worker offline attendance queue', false),
  ('templates.designer_v2',           'Snap/guides/layers/history in the template designer', false),
  ('certificates.public_verification','Public /verify endpoint and page', true),
  ('comms.sms',                       'SMS channel in the notification outbox worker', true),
  ('comms.email',                     'Email channel in the notification outbox worker', true),
  ('comms.pause_all',                 'Kill switch: pause every outbound message', false),
  ('registration.public_form',        'Public registration form (per-tenant off = closed)', true),
  ('billing.enforce_limits',          'Plan-limit checks (off = log-only, migration grace)', true),
  ('platform.maintenance_banner',     'Dismissible platform maintenance banner', false)
on conflict (key) do update
  set description = excluded.description;

-- ---------------------------------------------------------------------------
-- Webhook dedupe (spec §2.7.2): a provider retrying the same event must not
-- apply a payment twice.
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_ref text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, provider_ref, event_type)
);
create index on public.webhook_events (provider, processed_at desc);

create trigger set_updated_at before update on public.feature_flags
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.feature_flag_overrides
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.feature_flags enable row level security;
create policy "flags_read" on public.feature_flags
  for select to authenticated using (true);
create policy "flags_super_admin" on public.feature_flags
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.feature_flag_overrides enable row level security;
create policy "flag_overrides_member_read" on public.feature_flag_overrides
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt());
create policy "flag_overrides_super_admin" on public.feature_flag_overrides
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

-- Webhook events are written only by service-role Edge Functions.
alter table public.webhook_events enable row level security;
create policy "webhook_events_super_admin" on public.webhook_events
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());
revoke all on public.webhook_events from anon, authenticated;
