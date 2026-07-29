-- Vehicles / fleet + maintenance logs (blueprint §2 module 3, §7; spec §1.3.12, §2.6)

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid references public.branches(id),
  plate_number text not null,
  transmission text not null default 'manual' check (transmission in ('manual', 'automatic')),
  fuel_type text check (fuel_type in ('petrol', 'diesel', 'electric', 'hybrid')),
  make text,
  model text,
  year int,
  color text,
  odometer_km int not null default 0,
  status vehicle_status not null default 'active',
  insurance_expiry date,
  fitness_expiry date,
  photo_storage_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vehicles (tenant_id);
create index on public.vehicles (tenant_id, status);
-- Plate numbers are unique per tenant while not retired (spec §2.6).
create unique index vehicles_plate_active
  on public.vehicles (tenant_id, plate_number)
  where status <> 'retired';

create table public.vehicle_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null,   -- 'service','repair','insurance_renewal','fitness_inspection','fuel'
  status maintenance_status not null default 'scheduled',
  due_date date,
  due_odometer_km int,
  completed_at timestamptz,
  completed_by uuid references public.users(id),
  cost numeric(12,2),
  odometer_km int,
  notes text,
  next_due_date date,
  next_due_odometer_km int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vehicle_maintenance_logs (tenant_id, vehicle_id);

create trigger set_updated_at before update on public.vehicles
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.vehicle_maintenance_logs
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vehicles enable row level security;

create policy "vehicles_member_read" on public.vehicles
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

create policy "vehicles_admin_write" on public.vehicles
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
    and public.tenant_is_writable()
  );

create policy "vehicles_super_admin" on public.vehicles
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.vehicle_maintenance_logs enable row level security;

create policy "maintenance_member_read" on public.vehicle_maintenance_logs
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());

create policy "maintenance_admin_write" on public.vehicle_maintenance_logs
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() in ('school_admin', 'branch_manager', 'receptionist')
    and public.tenant_is_writable()
  );

create policy "maintenance_super_admin" on public.vehicle_maintenance_logs
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

create trigger audit after insert or update or delete on public.vehicle_maintenance_logs
  for each row execute function public.audit_row();
