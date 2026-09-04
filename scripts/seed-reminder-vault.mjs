/**
 * Stores cron invoke credentials in Supabase Vault (not in git).
 * Uses the existing frontend URL + publishable key — same household-PIN model.
 */
import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("xxxxxxxx")) {
  console.error("FAIL: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing");
  process.exit(1);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const sql = `
SELECT vault.create_secret(${sqlLiteral(url)}, 'project_url')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url');

SELECT vault.create_secret(${sqlLiteral(key)}, 'reminder_invoke_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'reminder_invoke_key');
`;

const tmp = "scripts/.tmp-vault.sql";
writeFileSync(tmp, sql, "utf8");
const result = spawnSync("npx", ["supabase", "db", "query", "--linked", "--file", tmp], {
  stdio: "inherit",
  shell: true,
});
unlinkSync(tmp);
process.exit(result.status ?? 1);
