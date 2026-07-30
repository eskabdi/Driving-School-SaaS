-- ID cards (blueprint §2 module 12, §7; spec §2.11)
--
-- A card belongs to exactly one holder — a learner OR an instructor — enforced
-- by a CHECK plus the holder_type discriminator. PDF rendering lands with the
-- template designer; a card can be issued now with a serial card number.

create table public.id_card_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  card_type text not null default 'learner' check (card_type in ('learner', 'instructor')),
  status template_status not null default 'draft',
  layout jsonb not null default '{}'::jsonb,
  layout_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.id_card_templates (tenant_id, card_type);

create table public.id_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  template_id uuid references public.id_card_templates(id),
  learner_id uuid references public.learners(id),
  instructor_id uuid references public.instructors(id),
  holder_type text not null check (holder_type in ('learner', 'instructor')),
  card_number text not null,
  status card_status not null default 'active',
  issued_on date not null default current_date,
  expires_on date,
  storage_path_front text,
  storage_path_back text,
  issued_by uuid references public.users(id),
  replaced_by_card_id uuid references public.id_cards(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one holder must be set, matching holder_type.
  constraint one_holder check (
    (holder_type = 'learner' and learner_id is not null and instructor_id is null)
    or (holder_type = 'instructor' and instructor_id is not null and learner_id is null)
  )
);
create index on public.id_cards (tenant_id, status);
create index on public.id_cards (tenant_id, learner_id);
create unique index id_cards_number_active
  on public.id_cards (tenant_id, card_number)
  where status <> 'replaced';

create trigger set_updated_at before update on public.id_card_templates
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.id_cards
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.id_card_templates enable row level security;
create policy "id_templates_member_read" on public.id_card_templates
  for select to authenticated using (tenant_id = public.get_tenant_id_from_jwt());
create policy "id_templates_admin_write" on public.id_card_templates
  for all to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() = 'school_admin'
  )
  with check (
    tenant_id = public.get_tenant_id_from_jwt()
    and public.get_role_from_jwt() = 'school_admin'
    and public.tenant_is_writable()
  );
create policy "id_templates_super_admin" on public.id_card_templates
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

alter table public.id_cards enable row level security;
create policy "id_cards_self_read" on public.id_cards
  for select to authenticated
  using (
    tenant_id = public.get_tenant_id_from_jwt()
    and (learner_id = public.current_learner_id() or instructor_id = public.current_instructor_id())
  );
create policy "id_cards_staff_read" on public.id_cards
  for select to authenticated
  using (tenant_id = public.get_tenant_id_from_jwt() and public.is_tenant_staff());
create policy "id_cards_super_admin" on public.id_cards
  for all to authenticated
  using (public.is_super_admin_from_jwt()) with check (public.is_super_admin_from_jwt());

create trigger audit after insert or update or delete on public.id_cards
  for each row execute function public.audit_row();
