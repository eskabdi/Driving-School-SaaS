# Edge Functions index

Custom server-side logic runs as Supabase Edge Functions (Deno). Everything else
hits PostgREST directly. Each function validates input with a shared Zod schema,
uses the service-role key only for cross-tenant operations, and returns RFC 7807
error envelopes (see [spec §7](./build-spec-v2.md)).

> Status: implemented so far — `submit-public-registration`,
> `review-public-registration`, `enroll-learner`, `create-tenant`,
> `lesson-complete`, `record-payment`, `request-refund`, `decide-refund`,
> `issue-certificate`, `revoke-certificate`, `verify-certificate`,
> `issue-id-card`, plus the shared `_shared/` wrapper. The rest of this index
> tracks the target surface from blueprint §8 and spec §2 so functions land
> against a stable contract.

## Local dev

```bash
supabase functions serve            # serve all functions locally
supabase functions deploy enroll-learner   # deploy one
```

Each function needs these secrets (set via `supabase secrets set`):
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Tenant & user lifecycle
| Function | Purpose | Auth |
|---|---|---|
| `create-tenant` | Onboard a new driving school; seed settings, categories, skills, templates; create first `school_admin` | Service role (super admin) |
| `accept-invite` | Verify invite token, create/link auth user, insert `public.users` | Public (token) |
| `impersonate-tenant` | Mint a scoped session as a synthetic `school_admin` | Service role (super admin) |

## Enrollment, lessons, evaluation
| Function | Purpose | Auth |
|---|---|---|
| `enroll-learner` | Plan-limit check, snapshot package, create invoice(s) | Service role |
| `complete_lesson` (RPC) | Attendance, evaluations, hour-bank recompute, milestones | Service role |
| `reschedule-lesson` | Atomic cancel + rebook | Service role |
| `start-exam-attempt` / `submit-exam-attempt` | Mock exam engine | Service role |

## Billing
| Function | Purpose | Auth |
|---|---|---|
| `initiate-payment` | Provider checkout with idempotency key | Service role |
| `payment-webhook` | Verified provider callback; `apply_payment` RPC | Provider signature |
| `generate-receipt` | Receipt PDF | Service role |

## Registration, cards, certificates
| Function | Purpose | Auth |
|---|---|---|
| `submit-public-registration` | Store submission + KYC (captcha, rate-limited) | Public |
| `review-public-registration` | Approve/convert; move KYC files (service role, fixes G11) | Service role |
| `generate-id-card` / `generate-batch-id-cards` | Render card PDFs | Service role |
| `issue-certificate` / `revoke-certificate` | Certificate lifecycle | Service role |
| `verify-certificate` | Public status lookup (rate-limited, constant-time) | Public |
| `template-preview` / `template-publish` / `template-clone` | Template designer | Service role |

## Ops & comms
| Function | Purpose | Auth |
|---|---|---|
| `process-notification-outbox` | Cron: deliver queued notifications | Service role |
| `expire-enrollments` / `expire-submissions` / `expire-trials` | Cron sweeps | Service role |
| `lesson-sweep` / `vehicle-doc-check` / `billing-check` | Cron sweeps | Service role |
| `health` | Health endpoint contract (spec §3.2) | Public |
| `alert-router` | Fan out infra alerts to Telegram + email | Service role |
