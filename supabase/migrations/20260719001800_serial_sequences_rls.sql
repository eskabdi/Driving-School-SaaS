-- Close an RLS gap on public.serial_sequences.
--
-- The table was created in 20260719000600 without `enable row level security`,
-- so PostgREST exposed every tenant's counters to any authenticated user —
-- readable cross-tenant, and worse, writable: tampering with next_value would
-- force duplicate card/certificate/invoice serials.
--
-- Nothing legitimate reads this table directly. public.next_serial() is
-- SECURITY DEFINER and therefore bypasses RLS, so enabling RLS with no
-- tenant-facing policy denies all direct access while leaving serial issuance
-- working. Only the super_admin bypass is kept, for platform support.

alter table public.serial_sequences enable row level security;

create policy "serial_sequences_super_admin" on public.serial_sequences
  for all to authenticated
  using (public.is_super_admin_from_jwt())
  with check (public.is_super_admin_from_jwt());

-- Belt and braces: revoke the default grants so the table is unreachable via
-- PostgREST even if a policy is added carelessly later.
revoke all on public.serial_sequences from anon, authenticated;
