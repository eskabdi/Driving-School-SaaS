// RFC 7807 error envelope for Edge Functions (spec §7.1).

export interface ProblemInit {
  code: string;
  status: number;
  title?: string;
  detail?: string;
  fields?: Record<string, string>;
  retryable?: boolean;
}

export class AppProblem extends Error {
  code: string;
  status: number;
  title: string;
  detail?: string;
  fields?: Record<string, string>;
  retryable: boolean;

  constructor(init: ProblemInit) {
    super(init.detail ?? init.code);
    this.code = init.code;
    this.status = init.status;
    this.title = init.title ?? init.code;
    this.detail = init.detail;
    this.fields = init.fields;
    this.retryable = init.retryable ?? false;
  }
}

export function problem(init: ProblemInit): AppProblem {
  return new AppProblem(init);
}

export function toEnvelope(err: AppProblem, requestId: string) {
  return {
    type: `https://errors.app/${err.code}`,
    title: err.title,
    status: err.status,
    code: err.code,
    detail: err.detail,
    request_id: requestId,
    fields: err.fields,
    retryable: err.retryable,
  };
}
