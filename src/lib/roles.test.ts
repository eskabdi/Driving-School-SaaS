import { describe, it, expect } from 'vitest';
import {
  ROLES,
  CAPABILITIES,
  ROLE_CAPABILITIES,
  roleHasCapability,
  type Role,
  type Capability,
} from './roles';

describe('roleHasCapability', () => {
  it('returns false for a null/undefined role instead of throwing', () => {
    expect(roleHasCapability(undefined, 'own.progress')).toBe(false);
    expect(roleHasCapability(null, 'own.progress')).toBe(false);
  });

  it('returns false for an unknown role', () => {
    expect(roleHasCapability('nobody' as Role, 'own.progress')).toBe(false);
  });

  it('grants super_admin every capability', () => {
    for (const cap of CAPABILITIES) {
      expect(roleHasCapability('super_admin', cap)).toBe(true);
    }
  });
});

describe('capability matrix invariants (spec §6.5)', () => {
  it('every role maps to a subset of the known CAPABILITIES', () => {
    const known = new Set<Capability>(CAPABILITIES);
    for (const role of ROLES) {
      for (const cap of ROLE_CAPABILITIES[role]) {
        expect(known.has(cap), `${role} has unknown capability ${cap}`).toBe(true);
      }
    }
  });

  it('lists no duplicate capabilities within a role', () => {
    for (const role of ROLES) {
      const grants = ROLE_CAPABILITIES[role];
      expect(new Set(grants).size, `${role} has duplicate grants`).toBe(grants.length);
    }
  });

  it('has an entry for every declared role', () => {
    for (const role of ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeDefined();
    }
  });
});

describe('role/capability boundaries that gate the UI', () => {
  // Pin the grants most likely to cause an authorization regression if edited.
  const has = roleHasCapability;

  it('separates delivering a lesson from scheduling one', () => {
    expect(has('instructor', 'lessons.deliver')).toBe(true);
    expect(has('instructor', 'lessons.schedule')).toBe(false);
    expect(has('receptionist', 'lessons.schedule')).toBe(true);
    expect(has('receptionist', 'lessons.deliver')).toBe(false);
  });

  it('restricts self-service roles to their own progress and online payment', () => {
    for (const role of ['learner', 'parent'] as const) {
      expect(ROLE_CAPABILITIES[role]).toEqual(
        expect.arrayContaining(['own.progress', 'payments.pay_online']),
      );
      expect(has(role, 'invoices.manage')).toBe(false);
      expect(has(role, 'users.manage')).toBe(false);
      expect(has(role, 'finance.reports')).toBe(false);
    }
  });

  it('keeps refund approval to accountant and school_admin only', () => {
    const approvers = ROLES.filter((r) => has(r, 'refunds.approve'));
    expect(new Set(approvers)).toEqual(new Set(['super_admin', 'school_admin', 'accountant']));
  });

  it('only super_admin can manage tenants', () => {
    const managers = ROLES.filter((r) => has(r, 'tenants.manage'));
    expect(managers).toEqual(['super_admin']);
  });

  it('gates online vs cash payment on distinct roles', () => {
    expect(has('learner', 'payments.pay_online')).toBe(true);
    expect(has('learner', 'payments.record_cash')).toBe(false);
    expect(has('receptionist', 'payments.record_cash')).toBe(true);
    expect(has('receptionist', 'payments.pay_online')).toBe(false);
  });
});
