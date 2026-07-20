/**
 * Canonical role + capability definitions (spec §6.5).
 *
 * This is the single source of truth for the frontend route guards. It is
 * mirrored into a SQL seed (`role_capabilities`) so the in-app capability
 * matrix (§3.5) and enforcement never drift. Route guards are UX-only — the
 * real security boundary is RLS + Edge Function checks (blueprint §9).
 */

export const ROLES = [
  'super_admin',
  'school_admin',
  'branch_manager',
  'accountant',
  'receptionist',
  'instructor',
  'examiner',
  'learner',
  'parent',
] as const;

export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'tenants.manage',
  'users.manage',
  'settings.edit',
  'templates.edit',
  'cards_certs.issue',
  'certs.revoke',
  'registrations.review',
  'lessons.schedule',
  'lessons.deliver',
  'exams.grade',
  'invoices.manage',
  'refunds.approve',
  'payments.record_cash',
  'payments.pay_online',
  'finance.reports',
  'audit.view',
  'own.progress',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Capability grants per role. Excerpt of the binding matrix in spec §6.5. */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  super_admin: [...CAPABILITIES],
  school_admin: [
    'users.manage',
    'settings.edit',
    'templates.edit',
    'cards_certs.issue',
    'certs.revoke',
    'registrations.review',
    'lessons.schedule',
    'exams.grade',
    'invoices.manage',
    'refunds.approve',
    'payments.record_cash',
    'finance.reports',
    'audit.view',
  ],
  branch_manager: [
    'users.manage',
    'cards_certs.issue',
    'registrations.review',
    'lessons.schedule',
    'payments.record_cash',
    'finance.reports',
  ],
  accountant: [
    'invoices.manage',
    'refunds.approve',
    'payments.record_cash',
    'certs.revoke',
    'finance.reports',
    'audit.view',
  ],
  receptionist: [
    'cards_certs.issue',
    'registrations.review',
    'lessons.schedule',
    'payments.record_cash',
  ],
  instructor: ['lessons.deliver', 'own.progress'],
  examiner: ['exams.grade', 'own.progress'],
  learner: ['payments.pay_online', 'own.progress'],
  parent: ['payments.pay_online', 'own.progress'],
};

export function roleHasCapability(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false;
}
