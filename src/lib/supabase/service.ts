import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A service-role client for server jobs (sync, seeding, locking). Bypasses
 * RLS, so only use it in code paths that have already checked the caller.
 * Kept free of Next.js imports so command-line scripts can use it too; the
 * key is never exposed to the browser because it has no NEXT_PUBLIC_ prefix.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
