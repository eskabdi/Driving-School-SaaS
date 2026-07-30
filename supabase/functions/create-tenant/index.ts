// create-tenant (spec §2.1, §5.1.1)
// Super-admin only. Atomically onboards a school: tenant row, default settings,
// a trial subscription, a default branch, and the first school_admin (auth user
// + public.users row, invited by email). Compensates on failure so a partial
// onboarding never leaves an orphaned auth user.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

// Starter practical-skill checklist for Automobile learners (spec §2.1).
const DEFAULT_AUTOMOBILE_SKILLS = [
  { code: 'cockpit_drill', en: 'Cockpit drill & controls', am: 'የመቆጣጠሪያ ዝግጅት', om: 'Qophii too\'annoo' },
  { code: 'moving_off', en: 'Moving off & stopping', am: 'መንቀሳቀስ እና ማቆም', om: 'Ka\'uu fi dhaabuu' },
  { code: 'steering', en: 'Steering control', am: 'የመሪ ቁጥጥር', om: 'To\'annoo isteeringii' },
  { code: 'gear_changing', en: 'Gear changing', am: 'ማርሽ መቀየር', om: 'Giyaara jijjiiruu' },
  { code: 'junctions', en: 'Junctions', am: 'መጋጠሚያዎች', om: 'Wal-qunnamtii' },
  { code: 'roundabouts', en: 'Roundabouts', am: 'ክብ መንገዶች', om: 'Naanneffannoo' },
  { code: 'parallel_parking', en: 'Parallel parking', am: 'ትይዩ ማቆም', om: 'Dhaabbii walgitu' },
  { code: 'reversing', en: 'Reversing', am: 'ወደ ኋላ መንዳት', om: 'Duubatti oofuu' },
  { code: 'hill_start', en: 'Hill start', am: 'በዳገት መነሳት', om: 'Gaara irraa ka\'uu' },
  { code: 'emergency_stop', en: 'Emergency stop', am: 'የአስቸኳይ ማቆም', om: 'Dhaabbii ariifachiisaa' },
];

const schema = z.object({
  schoolName: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes'),
  defaultLocale: z.enum(['en', 'am', 'om']).default('en'),
  dateCalendar: z.enum(['ethiopian', 'gregorian']).default('ethiopian'),
  timezone: z.string().default('Africa/Addis_Ababa'),
  planCode: z.string().default('starter'),
  trialDays: z.number().int().min(0).max(60).default(30),
  adminFullName: z.string().min(2).max(200),
  adminEmail: z.string().email(),
});

Deno.serve(
  serve(
    { schema, requireAuth: true, allowedRoles: ['super_admin'] },
    async ({ body, service }) => {
      // Slug uniqueness (friendly error before we create anything).
      const { data: existing } = await service
        .from('tenants')
        .select('id')
        .eq('slug', body.slug)
        .maybeSingle();
      if (existing) {
        throw problem({
          code: 'VALIDATION_FAILED',
          status: 409,
          fields: { slug: 'This slug is already taken' },
        });
      }

      // Resolve plan.
      const { data: plan } = await service
        .from('plans')
        .select('id')
        .eq('code', body.planCode)
        .maybeSingle();
      if (!plan) {
        throw problem({
          code: 'VALIDATION_FAILED',
          status: 400,
          fields: { planCode: 'Unknown plan' },
        });
      }

      // 1) Tenant.
      const { data: tenant, error: tErr } = await service
        .from('tenants')
        .insert({ name: body.schoolName, slug: body.slug, status: 'trial' })
        .select('id')
        .single();
      if (tErr) throw problem({ code: 'INTERNAL', status: 500, detail: tErr.message });

      // Rollback helper if a later step fails.
      const rollbackTenant = async () => {
        await service.from('tenants').delete().eq('id', tenant.id);
      };

      // 2) Settings.
      const { error: sErr } = await service.from('tenant_settings').insert({
        tenant_id: tenant.id,
        default_locale: body.defaultLocale,
        date_calendar: body.dateCalendar,
        timezone: body.timezone,
      });
      if (sErr) {
        await rollbackTenant();
        throw problem({ code: 'INTERNAL', status: 500, detail: sErr.message });
      }

      // 2b) Default skills for Automobile (category 3) so the evaluation
      // checklist is usable out of the box (spec §2.1). Tenant-customizable.
      await service.from('skills').insert(
        DEFAULT_AUTOMOBILE_SKILLS.map((s, i) => ({
          tenant_id: tenant.id,
          license_category_code: '3',
          code: s.code,
          name_en: s.en,
          name_am: s.am,
          name_om: s.om,
          sort_order: i + 1,
        })),
      );

      // 3) Trial subscription.
      const now = new Date();
      const trialEnds = new Date(now.getTime() + body.trialDays * 86400_000);
      await service.from('tenant_subscriptions').insert({
        tenant_id: tenant.id,
        plan_id: plan.id,
        status: 'trialing',
        trial_ends_at: trialEnds.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: trialEnds.toISOString(),
      });

      // 4) Default branch.
      const { data: branch } = await service
        .from('branches')
        .insert({ tenant_id: tenant.id, name: 'Main Branch' })
        .select('id')
        .single();

      // 5) First school_admin — invite the auth user, then link a users row.
      const { data: invited, error: iErr } = await service.auth.admin.inviteUserByEmail(
        body.adminEmail,
        { data: { full_name: body.adminFullName, tenant_slug: body.slug } },
      );
      if (iErr || !invited?.user) {
        await rollbackTenant();
        throw problem({
          code: 'INTERNAL',
          status: 500,
          detail: iErr?.message ?? 'Could not invite the administrator',
        });
      }

      const { error: uErr } = await service.from('users').insert({
        auth_user_id: invited.user.id,
        tenant_id: tenant.id,
        role: 'school_admin',
        status: 'invited',
        branch_id: branch?.id ?? null,
        full_name: body.adminFullName,
        locale: body.defaultLocale,
      });
      if (uErr) {
        // Compensate: remove the invited auth user and the tenant.
        await service.auth.admin.deleteUser(invited.user.id);
        await rollbackTenant();
        throw problem({ code: 'INTERNAL', status: 500, detail: uErr.message });
      }

      return {
        tenant_id: tenant.id,
        slug: body.slug,
        admin_email: body.adminEmail,
        admin_invited: true,
      };
    },
  ),
);
