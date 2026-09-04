/**
 * Reports which public Firebase env names are set. Never prints values.
 */
import { missingPublicFirebaseEnvNames } from "../supabase/functions/_shared/fcm-auth.js";

const names = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_VAPID_KEY",
];

const env = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const missing = missingPublicFirebaseEnvNames(env);
for (const name of names) {
  console.log(`${name}: ${missing.includes(name) ? "MISSING" : "SET"}`);
}
if (missing.length) {
  console.log("MISSING_NAMES:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log("PUBLIC_FIREBASE_ENV: complete");
}
