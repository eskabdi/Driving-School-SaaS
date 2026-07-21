// enroll-learner (spec §2.4, §5.3.1)
// Staff-invoked. Validates the learner + package belong to the caller's tenant,
// snapshots package hours/price into the enrollment, and creates the first
// invoice. Enrollment starts `pending_payment`; activation happens on payment.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  learnerId: z.string().uuid(),
  coursePackageId: z.string().uuid(),
});

const STAFF = ['school_admin', 'branch_manager', 'receptionist'];

Deno.serve(
  serve({ schema, requireAuth: true, allowedRoles: STAFF }, async ({ body, auth, service }) => {
    const tenantId = auth.tenantId;
    if (!tenantId) throw problem({ code: 'FORBIDDEN', status: 403 });

    // Validate learner belongs to tenant.
    const { data: learner } = await service
      .from('learners')
      .select('id, tenant_id, archived_at')
      .eq('id', body.learnerId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!learner || learner.archived_at) {
      throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Learner not found' });
    }

    // Validate package belongs to tenant + is active.
    const { data: pkg } = await service
      .from('course_packages')
      .select('id, tenant_id, name, total_hours, price, validity_days, active')
      .eq('id', body.coursePackageId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!pkg || !pkg.active) {
      throw problem({ code: 'NOT_FOUND', status: 404, detail: 'Package not available' });
    }

    // Plan-limit guard (spec §1.3.14).
    const { data: withinLimit } = await service.rpc('check_plan_limit', {
      p_tenant: tenantId,
      p_limit_key: 'max_learners',
    });
    if (withinLimit === false) {
      throw problem({ code: 'PLAN_LIMIT_REACHED', status: 402 });
    }

    // Create the enrollment with snapshotted hours + price.
    const expiresAt = new Date(Date.now() + pkg.validity_days * 86400_000)
      .toISOString()
      .slice(0, 10);

    const { data: enrollment, error: eErr } = await service
      .from('enrollments')
      .insert({
        tenant_id: tenantId,
        learner_id: body.learnerId,
        course_package_id: body.coursePackageId,
        status: 'pending_payment',
        hours_total: pkg.total_hours,
        price_at_enrollment: pkg.price,
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (eErr) throw problem({ code: 'INTERNAL', status: 500, detail: eErr.message });

    // First invoice for the package.
    const { data: invNumber } = await service.rpc('next_serial', {
      p_tenant: tenantId,
      p_kind: 'invoice',
    });

    const { data: invoice, error: invErr } = await service
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        learner_id: body.learnerId,
        enrollment_id: enrollment.id,
        number: invNumber,
        status: 'issued',
        amount: pkg.price,
        issued_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (invErr) throw problem({ code: 'INTERNAL', status: 500, detail: invErr.message });

    await service.from('invoice_items').insert({
      tenant_id: tenantId,
      invoice_id: invoice.id,
      kind: 'package',
      description: pkg.name,
      qty: 1,
      unit_price: pkg.price,
    });

    return { enrollment_id: enrollment.id, invoice_id: invoice.id, invoice_number: invNumber };
  }),
);
