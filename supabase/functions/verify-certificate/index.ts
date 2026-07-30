// verify-certificate (spec §2.12): PUBLIC, unauthenticated lookup by code.
// Returns only a minimal JSON status (valid | expired | revoked | not_found)
// plus the holder initial, type, issue date and school name — never the PDF or
// PII. Delegates to the verify_certificate SECURITY DEFINER function.

import { serve } from '../_shared/handler.ts';
import { problem } from '../_shared/errors.ts';
import { z } from 'zod';

const schema = z.object({
  code: z.string().min(1).max(40),
});

Deno.serve(
  serve({ schema }, async ({ body, service }) => {
    // TODO: per-IP rate limit (30/min, spec §2.12) via a Postgres unlogged
    // bucket table before the lookup.
    const { data, error } = await service.rpc('verify_certificate', { p_code: body.code });
    if (error) throw problem({ code: 'INTERNAL', status: 500, detail: error.message });
    return data;
  }),
);
