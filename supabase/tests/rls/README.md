# RLS test harness (spec §6.6)

pgTAP tests that assert Row Level Security behaves correctly for a seeded
two-tenant fixture. They are the concrete form of the blueprint's CI promise:
tenant isolation is verified, not assumed.

## Running

```bash
supabase start          # local stack (Postgres with pgTAP)
supabase test db        # runs every *_test.sql under supabase/tests/
```

`supabase test db` applies all migrations to a fresh test database, then runs
each file. Each test wraps its work in `begin … rollback` so fixtures never
persist.

## The pattern (see `learners_test.sql`)

1. Seed a two-tenant fixture as the superuser (RLS does not filter this role).
2. `set local role authenticated` and `select set_config('request.jwt.claims', …)`
   to simulate an actor — the same claims the JWT helpers
   (`get_tenant_id_from_jwt`, `get_role_from_jwt`, `tenant_is_writable`, …) read.
3. Assert with pgTAP (`is`, `throws_ok`, …):
   - cross-tenant `select` returns 0 rows for every role;
   - the capability matrix (spec §6.5) as positive/negative assertions;
   - writes are blocked when `tenant_status = 'suspended'` (SQLSTATE 42501);
   - a learner cannot read `is_correct` on mock-exam options mid-attempt.

## Coverage goal

One `*_test.sql` per RLS-enabled table, eventually. A meta-test should fail CI
if any table with RLS enabled lacks a corresponding test file (query
`pg_policies` / `pg_tables` vs. this directory listing).

Current files:
- `learners_test.sql` — the reference pattern: cross-tenant isolation +
  suspended-tenant write block.
- `payments_test.sql` — the self-read policy that resolves through
  `invoices.learner_id` (not a direct `payments.learner_id` column), plus
  cross-tenant isolation.
- `certificates_test.sql` — the public `verify_certificate()` contract: anon can
  call it, the payload never exposes PII beyond the holder initial, and
  `not_found` vs. `revoked` are distinguished without a direct table read.
- `registrations_write_block_test.sql` — the duplicate-active-phone partial
  index (non-terminal states only) and the suspended-tenant write block on a
  second table, to prove the pattern generalizes.
- `status_transitions_test.sql` — the `enforce_status_transition` guard
  (migration `20260719001900`): legal edges succeed, illegal edges raise
  `P0001`, and a no-op status update never trips the guard.

Remaining tables to extend this to: `lessons` (scheduling + double-booking),
`invoices`, `evaluations`, `refunds`, `id_cards`, `enrollments`.
