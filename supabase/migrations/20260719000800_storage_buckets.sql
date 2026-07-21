-- Storage buckets for the registration/KYC flow (blueprint §7 Storage; spec §2.3)
--
-- `kyc-uploads-pending` holds files uploaded via the public form. It is private
-- and has NO authenticated read policy — only the service-role EF can read it,
-- which is exactly why the KYC move must happen server-side (fixes G11).
--
-- `kyc-documents` holds a learner's permanent KYC. Tenant staff may read; files
-- are namespaced by learner id (path prefix `{learner_id}/…`).

insert into storage.buckets (id, name, public)
values
  ('kyc-uploads-pending', 'kyc-uploads-pending', false),
  ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- Tenant staff may read files in kyc-documents. Cross-tenant isolation is by
-- learner ownership; a tighter per-tenant path check can be added once the
-- storage path convention includes the tenant id.
create policy "kyc_documents_staff_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and public.is_tenant_staff()
  );

-- No authenticated policy for kyc-uploads-pending: reads/writes there are
-- service-role only (public uploads go through a signed upload URL minted by
-- the submit flow; the pending bucket is never directly readable).
