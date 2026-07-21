import { supabase } from './supabase';
import { normalizeError, type AppError } from './errors';

/**
 * Typed invoker for Supabase Edge Functions. Normalizes the RFC 7807 envelope
 * (spec §7) into an AppError on failure so callers get one consistent shape.
 */
export async function invokeFunction<TResult>(
  name: string,
  body: unknown,
): Promise<TResult> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });

  if (error) {
    // supabase-js wraps non-2xx; try to read the JSON envelope from the response.
    // deno FunctionsHttpError carries a `context` Response.
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const envelope = await ctx.json();
        throw normalizeError(envelope);
      } catch (e) {
        if ((e as AppError).code) throw e;
      }
    }
    throw normalizeError(error);
  }

  // Some functions return {code} envelopes with 200 in edge cases — pass through.
  return data as TResult;
}
