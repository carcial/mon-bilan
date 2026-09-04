export const FCM_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_OAUTH_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
export const FCM_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

export function normalizeServiceAccountPrivateKey(raw) {
  let key = String(raw || "").trim();
  if (!key) return "";
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  return key.trim();
}

export function isNormalizedPemPrivateKey(pem) {
  const key = normalizeServiceAccountPrivateKey(pem);
  return (
    key.includes("-----BEGIN PRIVATE KEY-----") &&
    key.includes("-----END PRIVATE KEY-----") &&
    !key.includes("\\n")
  );
}

export function buildFcmHttpV1SendUrl(projectId) {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("FIREBASE_PROJECT_ID is required");
  return `https://fcm.googleapis.com/v1/projects/${id}/messages:send`;
}

export function buildFcmHttpV1Message({ fid, title, body, targetUrl, reminderType, dedupKey }) {
  return {
    message: {
      fid: String(fid),
      android: { priority: "high" },
      data: {
        title: String(title || ""),
        body: String(body || ""),
        url: String(targetUrl || ""),
        reminder_type: String(reminderType || ""),
        dedup_key: String(dedupKey || ""),
      },
    },
  };
}

export function buildDeepLinkUrl(appBaseUrl, hashRoute) {
  const base = String(appBaseUrl || "").replace(/\/+$/, "");
  const route = String(hashRoute || "/");
  const hash = route.startsWith("#") ? route : `#${route.startsWith("/") ? route : `/${route}`}`;
  return base ? `${base}${hash}` : hash;
}

export function requiredPublicFirebaseEnvNames() {
  return [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_VAPID_KEY",
  ];
}

export function missingPublicFirebaseEnvNames(env = {}) {
  return requiredPublicFirebaseEnvNames().filter((name) => {
    const value = String(env[name] || "").trim();
    return !value || value.includes("YOUR_");
  });
}

export const FIREBASE_WEB_REGISTRATION_API = {
  client: "register + onRegistered",
  identifier: "fid",
  deprecatedClient: "getToken",
  deprecatedSendField: "token",
};

export function cronMatchesDouala1900(schedule) {
  return String(schedule || "").trim() === "0 18 * * *";
}

export const PRODUCTION_REMINDER_CRON = {
  name: "send-push-reminders-daily",
  schedule: "0 18 * * *",
};

export const TEMPORARY_SMOKE_CRON = {
  name: "push-smoke-test-every-minute",
  schedule: "* * * * *",
};

export const TEST_PUSH_COPY = {
  title: "Mon Bilan",
  body: "Notification test reçue avec succès.",
  targetHashRoute: "/",
  reminderType: "test_notification",
};

export const SMOKE_PUSH_COPY = {
  title: "Mon Bilan",
  body: "Rappel automatique de test.",
  targetHashRoute: "/",
  reminderType: "push_smoke_test",
};

export function isDiagnosticPushType(type) {
  return type === "test" || type === "smoke";
}

export function diagnosticPushDoesNotRequireAppBaseUrl() {
  return true;
}

export function buildEdgeCorsHeaders(origin) {
  const allowOrigin = String(origin || "").trim() || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

export function rappelsViewState({ permission, prefsEnabled, hasEnabledDevice }) {
  if (permission === "denied") return "permission_denied";
  if (permission === "granted" && prefsEnabled && hasEnabledDevice) return "activated";
  if (permission === "granted" && prefsEnabled && !hasEnabledDevice) return "registration_missing";
  return "disabled";
}
