/**
 * Harmless read-only Supabase connectivity check (Phase 1.5).
 * Usage: npm run verify:supabase
 * Does not print secret values.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

function mask(value) {
  if (!value) return "(missing)";
  if (value.length < 12) return "(set, short)";
  return `${value.slice(0, 8)}… (len=${value.length})`;
}

function summarizeRows(label, data) {
  if (!Array.isArray(data)) return String(data);
  if (label === "suppliers") {
    return data.map((r) => r.code).join(", ");
  }
  if (label === "church_funds") {
    return data.map((r) => `${r.code}:${r.name}`).join(", ");
  }
  if (label === "products") {
    return data.map((r) => r.name).join(", ");
  }
  return `count=${data.length}`;
}

async function main() {
  console.log("Supabase URL:", mask(url));
  console.log("Publishable key:", mask(key));

  if (
    !url ||
    !key ||
    url.includes("YOUR_PROJECT") ||
    key.includes("xxxxxxxx") ||
    key.includes("YOUR_SUPABASE")
  ) {
    console.error(
      "FAIL: configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env",
    );
    process.exit(1);
  }

  if (key.startsWith("sb_secret_") || key.includes("service_role")) {
    console.error("FAIL: refusing to use a privileged/secret key in the frontend verifier");
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const checks = [
    ["church_funds", () => sb.from("church_funds").select("code,name").order("sort_order")],
    ["suppliers", () => sb.from("suppliers").select("code,name").order("code")],
    ["products", () => sb.from("products").select("name,unit_type").eq("is_active", true)],
    ["church_combined_balance", () => sb.rpc("church_combined_balance")],
    [
      "views_product_inventory",
      () => sb.from("product_inventory").select("product_name,quantity_available").limit(5),
    ],
  ];

  let failed = false;
  for (const [label, run] of checks) {
    const { data, error } = await run();
    if (error) {
      failed = true;
      console.error(`FAIL ${label}:`, error.message);
    } else {
      console.log(`OK   ${label}:`, summarizeRows(label, data));
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
