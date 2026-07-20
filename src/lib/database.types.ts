/**
 * Generated database types placeholder.
 *
 * Replace this file with the real output of:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * It is the canonical type source for the typed Supabase client (blueprint §8).
 * Until the schema is applied to a linked project, this permissive stub keeps
 * the client typed as `any`-ish without blocking the build.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
