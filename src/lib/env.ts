/**
 * Environment. Public values (NEXT_PUBLIC_*) are safe in the browser; nothing
 * else in here may be imported from a client component.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** Supabase's publishable key (formerly the "anon" key). */
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Google Workspace domain(s) to steer the Google account picker to, comma-separated. */
export const allowedEmailDomain = process.env.NEXT_PUBLIC_PULSE_EMAIL_DOMAIN ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * Preview mode: no Supabase yet, so Pulse runs on built-in sample data with
 * sign-in switched off. Never allowed in production.
 */
export const isPreviewMode = !isSupabaseConfigured && process.env.NODE_ENV !== "production";
