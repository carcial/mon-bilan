import { createClient } from "@supabase/supabase-js";
import { config, isSupabaseConfigured } from "../../config.js";

/**
 * Canonical browser Supabase client (publishable key only).
 * Created once when env is present; null when not configured.
 *
 * @type {import('@supabase/supabase-js').SupabaseClient | null}
 */
export const supabase = isSupabaseConfigured()
  ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        // No authentication in this app.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Soft accessor for UI shell when .env may be missing. */
export function getSupabase() {
  return supabase;
}

export function getSupabaseOrThrow() {
  if (!supabase) {
    throw new Error(
      "Required Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}
