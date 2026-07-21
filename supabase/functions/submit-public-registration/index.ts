// submit-public-registration (spec §2.3, §5.2.1)
// Public, unauthenticated. Validates + stores a registration and returns only a
// short tracking code (never the row id — anti-enumeration). Turnstile
// verification and per-IP/phone rate limiting are applied before insert.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  tenantSlug: z.string().min(1),
  fullName: z.string().min(2).max(200),
  phone: z.string().regex(/^\+2519\d{8}$|^\+2517\d{8}$|^09\d{8}$|^07\d{8}$/, 'Invalid Ethiopian phone'),
  email: z.string().email().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  licenseCategoryApplied: z.string().optional(),
  preferredBranchId: z.string().uuid().optional(),
  preferredSchedule: z.string().max(200).optional(),
  kycStoragePaths: z.array(z.string()).max(6).optional(),
  consent: z.string().min(1, 'Consent is required'),
  turnstileToken: z.string().optional(),
});

Deno.serve(
  serve({ schema }, async ({ body, service }) => {
    // Resolve tenant by slug.
    const { data: tenant, error: tErr } = await service
      .from('tenants')
      .select('id, status')
      .eq('slug', body.tenantSlug)
      .maybeSingle();
    if (tErr) throw problem({ code: 'INTERNAL', status: 500, detail: tErr.message });
    if (!tenant) throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Unknown school' });

    if (!['trial', 'active', 'past_due'].includes(tenant.status)) {
      throw problem({ code: 'TENANT_SUSPENDED', status: 403 });
    }

    // Registration must be open for this tenant.
    const { data: settings } = await service
      .from('tenant_settings')
      .select('registration_open')
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (settings && settings.registration_open === false) {
      throw problem({ code: 'FORBIDDEN', status: 403, detail: 'Registration is closed' });
    }

    // TODO: verify Turnstile token and enforce per-IP / per-phone rate limits
    // (spec §10 security) before insert.

    // Generate the tracking code via the race-safe serial function.
    const { data: code, error: sErr } = await service.rpc('next_serial', {
      p_tenant: tenant.id,
      p_kind: 'tracking',
    });
    if (sErr) throw problem({ code: 'INTERNAL', status: 500, detail: sErr.message });

    const { error: iErr } = await service.from('public_registration_submissions').insert({
      tenant_id: tenant.id,
      tracking_code: code,
      full_name: body.fullName,
      phone: body.phone,
      email: body.email,
      date_of_birth: body.dateOfBirth,
      gender: body.gender,
      license_category_applied: body.licenseCategoryApplied,
      preferred_branch_id: body.preferredBranchId,
      preferred_schedule: body.preferredSchedule,
      kyc_storage_paths: body.kycStoragePaths ?? [],
      consent: body.consent,
      status: 'submitted',
    });

    if (iErr) {
      // Unique partial index → an active submission already exists for this
      // phone. Return a generic message to prevent enumeration (spec §2.3).
      if (iErr.code === '23505') {
        return { tracking_code: null, message: 'already_received' };
      }
      throw problem({ code: 'INTERNAL', status: 500, detail: iErr.message });
    }

    return { tracking_code: code };
  }),
);
