/**
 * Error handling standard (spec §7). All Edge Functions return RFC 7807+
 * envelopes; PostgREST errors are normalized into the same shape here.
 */

export interface AppError {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  request_id?: string;
  fields?: Record<string, string>;
  retryable: boolean;
}

/** Error codes from the catalog in spec §7.2. `errors.{code}` maps to i18n copy. */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'TENANT_SUSPENDED',
  'USER_DISABLED',
  'NOT_FOUND',
  'SCHED_CONFLICT',
  'LEARNER_DOUBLE_BOOKED',
  'TEMPLATE_VERSION_CONFLICT',
  'LESSON_ALREADY_COMPLETED',
  'INVOICE_ALREADY_SETTLED',
  'INVITE_EXISTS',
  'LAST_ADMIN_GUARD',
  'PLAN_LIMIT_REACHED',
  'HOUR_BANK_EXHAUSTED',
  'VEHICLE_DOC_EXPIRED',
  'TEMPLATE_TOKEN_UNRESOLVED',
  'PRINT_DEVICE_INVALID',
  'INVALID_STATUS_TRANSITION',
  'PAYMENT_AMOUNT_MISMATCH',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const RETRYABLE: ReadonlySet<string> = new Set(['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INTERNAL']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Coerce any thrown value (PostgREST error, EF envelope, network error) into a
 * single AppError shape the UI can render consistently.
 */
export function normalizeError(err: unknown): AppError {
  // Already an RFC 7807 envelope from an Edge Function.
  if (isRecord(err) && typeof err.code === 'string' && typeof err.status === 'number') {
    return {
      type: String(err.type ?? `https://errors.app/${err.code}`),
      title: String(err.title ?? err.code),
      status: err.status,
      code: err.code,
      detail: typeof err.detail === 'string' ? err.detail : undefined,
      request_id: typeof err.request_id === 'string' ? err.request_id : undefined,
      fields: isRecord(err.fields) ? (err.fields as Record<string, string>) : undefined,
      retryable: typeof err.retryable === 'boolean' ? err.retryable : RETRYABLE.has(err.code),
    };
  }

  // PostgREST / supabase-js error: { message, code (SQLSTATE), details, hint }.
  if (isRecord(err) && typeof err.message === 'string') {
    const sqlstate = typeof err.code === 'string' ? err.code : undefined;
    const code = mapSqlStateToCode(sqlstate, err.message);
    return {
      type: `https://errors.app/${code}`,
      title: code,
      status: httpForCode(code),
      code,
      detail: err.message,
      retryable: RETRYABLE.has(code),
    };
  }

  return {
    type: 'https://errors.app/INTERNAL',
    title: 'INTERNAL',
    status: 500,
    code: 'INTERNAL',
    detail: err instanceof Error ? err.message : 'Unknown error',
    retryable: true,
  };
}

/**
 * SQLSTATE → app error code (spec §7.4). P0001 is a deliberate `raise` from one
 * of our PL/pgSQL guards, and those messages start with the catalog code, so we
 * pass the raised code through rather than flattening it to INTERNAL.
 */
function mapSqlStateToCode(sqlstate: string | undefined, message?: string): ErrorCode {
  switch (sqlstate) {
    case '23P01': // exclusion_violation
      return 'SCHED_CONFLICT';
    case '23505': // unique_violation
      return 'INVOICE_ALREADY_SETTLED';
    case '42501': // insufficient_privilege (RLS)
      return 'FORBIDDEN';
    case 'PGRST301': // JWT expired
      return 'UNAUTHENTICATED';
    case 'P0001': {
      const raised = ERROR_CODES.find((c) => message?.includes(c));
      return raised ?? 'INTERNAL';
    }
    default:
      return 'INTERNAL';
  }
}

function httpForCode(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION_FAILED':
      return 400;
    case 'UNAUTHENTICATED':
      return 401;
    case 'PLAN_LIMIT_REACHED':
      return 402;
    case 'FORBIDDEN':
    case 'TENANT_SUSPENDED':
    case 'USER_DISABLED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'SCHED_CONFLICT':
    case 'LEARNER_DOUBLE_BOOKED':
    case 'TEMPLATE_VERSION_CONFLICT':
    case 'LESSON_ALREADY_COMPLETED':
    case 'INVOICE_ALREADY_SETTLED':
    case 'INVITE_EXISTS':
    case 'LAST_ADMIN_GUARD':
      return 409;
    case 'HOUR_BANK_EXHAUSTED':
    case 'VEHICLE_DOC_EXPIRED':
    case 'TEMPLATE_TOKEN_UNRESOLVED':
    case 'PRINT_DEVICE_INVALID':
    case 'INVALID_STATUS_TRANSITION':
    case 'PAYMENT_AMOUNT_MISMATCH':
      return 422;
    case 'RATE_LIMITED':
      return 429;
    case 'PROVIDER_UNAVAILABLE':
      return 502;
    default:
      return 500;
  }
}
