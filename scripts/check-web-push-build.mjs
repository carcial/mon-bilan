/**
 * Safe production-bundle check. Never prints key material.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

function fingerprint(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

const vite = String(process.env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
const server = String(process.env.WEB_PUSH_PUBLIC_KEY || "").trim();
const firebase = String(process.env.VITE_FIREBASE_VAPID_KEY || "").trim();
const files = readdirSync("dist/assets").filter((f) => f.endsWith(".js") && f.startsWith("index-"));
let bundle = "";
for (const file of files) bundle += readFileSync(`dist/assets/${file}`, "utf8");
const sw = readFileSync("dist/sw.js", "utf8");

console.log({
  vite_injected: Boolean(vite) && bundle.includes(vite),
  server_env_name_leaked_to_frontend: bundle.includes("WEB_PUSH_PRIVATE_KEY"),
  firebase_vapid_in_app_bundle: Boolean(firebase) && bundle.includes(firebase),
  firebase_config_in_sw: sw.includes("firebase.initializeApp"),
  sw_has_standard_push_listener: sw.includes('addEventListener("push"'),
  local_public_pair_match: Boolean(vite) && vite === server,
  public_fingerprint: fingerprint(vite),
});
