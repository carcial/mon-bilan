/**
 * Calls send-push-reminders type=auth. Prints only success/failure, never tokens.
 */
const url = String(process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
if (!url || !key) {
  console.error("MISSING_SUPABASE_FRONTEND_ENV");
  process.exit(1);
}

const res = await fetch(`${url}/functions/v1/send-push-reminders`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ type: "auth" }),
});

const text = await res.text();
let payload = {};
try {
  payload = JSON.parse(text);
} catch {
  payload = {};
}

if (res.ok && payload.ok && payload.oauth) {
  console.log("OAUTH_TEST: OK");
  process.exit(0);
}

const err = String(payload.error || "").replace(/-----BEGIN[\s\S]+?-----END [^-]+-----/g, "[pem omitted]");
console.error(`OAUTH_TEST: FAIL status=${res.status} error=${err || "unknown"}`);
process.exit(1);
