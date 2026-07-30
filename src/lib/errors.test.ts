import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES, normalizeError, type ErrorCode } from './errors';

// httpForCode / mapSqlStateToCode are exercised through normalizeError, which is
// the only public surface. Each block below pins a spec-§7 contract that a
// silent refactor could otherwise break.

describe('normalizeError — RFC 7807 envelope (Edge Function shape)', () => {
  it('passes through a well-formed envelope untouched', () => {
    const env = {
      type: 'https://errors.app/SCHED_CONFLICT',
      title: 'Scheduling conflict',
      status: 409,
      code: 'SCHED_CONFLICT',
      detail: 'Slot taken',
      request_id: 'req-1',
      fields: { start_at: 'overlaps' },
      retryable: false,
    };
    expect(normalizeError(env)).toEqual(env);
  });

  it('is detected by code+status, not by a message field', () => {
    // No `message` key: must still take the envelope branch, not fall through.
    const out = normalizeError({ code: 'NOT_FOUND', status: 404 });
    expect(out.code).toBe('NOT_FOUND');
    expect(out.title).toBe('NOT_FOUND'); // falls back to code
    expect(out.type).toBe('https://errors.app/NOT_FOUND');
  });

  it('derives retryable from the code when the flag is absent', () => {
    expect(normalizeError({ code: 'RATE_LIMITED', status: 429 }).retryable).toBe(true);
    expect(normalizeError({ code: 'FORBIDDEN', status: 403 }).retryable).toBe(false);
  });

  it('honours an explicit retryable flag over the derived default', () => {
    // INTERNAL is normally retryable; an explicit false must win.
    expect(normalizeError({ code: 'INTERNAL', status: 500, retryable: false }).retryable).toBe(
      false,
    );
  });

  it('drops a non-string detail and a non-record fields value', () => {
    const out = normalizeError({ code: 'NOT_FOUND', status: 404, detail: 42, fields: 'nope' });
    expect(out.detail).toBeUndefined();
    expect(out.fields).toBeUndefined();
  });
});

describe('normalizeError — PostgREST / supabase-js shape (SQLSTATE)', () => {
  const cases: Array<[string, string, ErrorCode, number]> = [
    ['23P01', 'exclusion violation', 'SCHED_CONFLICT', 409],
    ['23505', 'duplicate key', 'INVOICE_ALREADY_SETTLED', 409],
    ['42501', 'permission denied', 'FORBIDDEN', 403],
    ['PGRST301', 'JWT expired', 'UNAUTHENTICATED', 401],
  ];
  it.each(cases)('maps SQLSTATE %s → %s (HTTP %s)', (sqlstate, message, code, status) => {
    const out = normalizeError({ message, code: sqlstate });
    expect(out.code).toBe(code);
    expect(out.status).toBe(status);
    expect(out.detail).toBe(message); // original message preserved
  });

  it('falls back to INTERNAL for an unknown SQLSTATE', () => {
    const out = normalizeError({ message: 'boom', code: '99999' });
    expect(out.code).toBe('INTERNAL');
    expect(out.status).toBe(500);
    expect(out.retryable).toBe(true);
  });

  it('handles a PostgREST error with no code field', () => {
    expect(normalizeError({ message: 'network' }).code).toBe('INTERNAL');
  });
});

describe('normalizeError — P0001 raised-guard passthrough', () => {
  it('extracts the catalog code embedded in a raised P0001 message', () => {
    const out = normalizeError({
      message: 'HOUR_BANK_EXHAUSTED: no hours left on this enrollment',
      code: 'P0001',
    });
    expect(out.code).toBe('HOUR_BANK_EXHAUSTED');
    expect(out.status).toBe(422);
  });

  it('falls back to INTERNAL when a P0001 message carries no known code', () => {
    expect(normalizeError({ message: 'something unexpected', code: 'P0001' }).code).toBe(
      'INTERNAL',
    );
  });
});

describe('normalizeError — arbitrary thrown values', () => {
  it('coerces a plain Error', () => {
    const out = normalizeError(new Error('kaboom'));
    expect(out).toMatchObject({ code: 'INTERNAL', status: 500, detail: 'kaboom', retryable: true });
  });

  it('coerces null / undefined / primitives without throwing', () => {
    for (const v of [null, undefined, 42, 'oops']) {
      expect(normalizeError(v).code).toBe('INTERNAL');
    }
  });
});

describe('error catalog drift guards (spec §7.2)', () => {
  const localeDir = (l: string) =>
    fileURLToPath(new URL(`../../public/locales/${l}/common.json`, import.meta.url));
  const locales = ['en', 'am', 'om'] as const;

  it.each(locales)('%s has an errors.<CODE> key for every ErrorCode', (locale) => {
    const common = JSON.parse(readFileSync(localeDir(locale), 'utf8')) as {
      errors?: Record<string, string>;
    };
    const keys = new Set(Object.keys(common.errors ?? {}));
    const missing = ERROR_CODES.filter((c) => !keys.has(c));
    expect(missing, `missing ${locale} copy for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ErrorCode resolves to a non-500 status except INTERNAL', () => {
    // A code with no explicit branch in httpForCode() falls through to 500;
    // this catches a new code added to the union but forgotten in the switch.
    // The P0001 passthrough is the one path that can reach httpForCode() for
    // every code (message === the exact code, so only that code matches).
    const only500 = ERROR_CODES.filter(
      (code) => normalizeError({ message: code, code: 'P0001' }).status === 500,
    );
    expect(only500).toEqual(['INTERNAL']);
  });
});
