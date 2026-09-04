/**
 * Generate a standard Web Push VAPID key pair (P-256).
 * Writes public values to stdout. Writes the private key only to .env when asked.
 * Never prints the private key unless --print-private is passed.
 */
import { webcrypto } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function bytesToUrlBase64(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function urlBase64ToBytes(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

async function generateVapidKeyPair() {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const x = urlBase64ToBytes(publicJwk.x);
  const y = urlBase64ToBytes(publicJwk.y);
  const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);
  return {
    publicKey: bytesToUrlBase64(uncompressed),
    privateKey: privateJwk.d,
  };
}

function upsertEnvFile(filePath, entries) {
  let text = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  if (text && !text.endsWith("\n")) text += "\n";
  for (const [name, value] of Object.entries(entries)) {
    const line = `${name}=${value}`;
    const re = new RegExp(`^${name}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text += `${text.endsWith("\n") || !text ? "" : "\n"}${line}\n`;
  }
  writeFileSync(filePath, text);
}

const printPrivate = process.argv.includes("--print-private");
const writeEnv = process.argv.includes("--write-env");
const keys = await generateVapidKeyPair();

console.log("VITE_WEB_PUSH_PUBLIC_KEY=" + keys.publicKey);
console.log("WEB_PUSH_PUBLIC_KEY=" + keys.publicKey);
console.log("WEB_PUSH_SUBJECT=mailto:YOUR_CONTACT_EMAIL");
if (printPrivate) {
  console.log("WEB_PUSH_PRIVATE_KEY=" + keys.privateKey);
} else {
  console.log("WEB_PUSH_PRIVATE_KEY=<generated locally; not printed>");
}

if (writeEnv) {
  const envPath = resolve(process.cwd(), ".env");
  upsertEnvFile(envPath, {
    VITE_WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    WEB_PUSH_PRIVATE_KEY: keys.privateKey,
    WEB_PUSH_SUBJECT: "mailto:YOUR_CONTACT_EMAIL",
  });
  console.log("Wrote VAPID values to .env (gitignored).");
}
