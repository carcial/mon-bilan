/**
 * App configuration — frontend-safe values only.
 * Never put service_role / secret / database passwords here.
 */

const trimSlash = (value) => String(value || "").replace(/\/+$/, "");

export const config = {
  appName: "Mon Bilan",
  locale: "fr-FR",
  currencyCode: "FCFA",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  /** Vite BASE_URL (normally `/` on Cloudflare Pages). */
  basePath: trimSlash(import.meta.env.BASE_URL || ""),
};

export function isSupabaseConfigured() {
  const url = config.supabaseUrl;
  const key = config.supabasePublishableKey;
  if (!url || !key) return false;
  if (url.includes("YOUR_PROJECT_REF")) return false;
  if (key.includes("YOUR_SUPABASE") || key.includes("sb_publishable_xxx")) return false;
  return true;
}
