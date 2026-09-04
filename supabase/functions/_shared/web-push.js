// Standard Web Push protocol helpers (shared by Edge Function, client, and tests).
// Reminder schedules stay in reminders.js — this file is transport only.

export const PUSH_PROVIDERS = {
  webpush: "webpush",
  firebase: "firebase",
};

export const WEB_PUSH_ICON_PATH = "/icons/icon-192.png";
export const WEB_PUSH_BADGE_PATH = "/icons/icon-192.png";

export function urlBase64ToUint8Array(base64String) {
  const raw = String(base64String || "").trim();
  if (!raw) throw new Error("VAPID public key is empty");
  const padding = "=".repeat((4 - (raw.length % 4)) % 4);
  const base64 = (raw + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) output[i] = binary.charCodeAt(i);
  return output;
}

export function uint8ArrayToUrlBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < view.length; i++) str += String.fromCharCode(view[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function vapidPublicKeyToApplicationServerKey(publicKey) {
  const bytes = urlBase64ToUint8Array(publicKey);
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error("VAPID public key must be an uncompressed P-256 point");
  }
  return bytes;
}

export function vapidKeysToJwk(publicKey, privateKey) {
  const pub = vapidPublicKeyToApplicationServerKey(publicKey);
  const priv = urlBase64ToUint8Array(privateKey);
  if (priv.length !== 32) {
    throw new Error("VAPID private key must be 32 bytes");
  }
  const x = uint8ArrayToUrlBase64(pub.subarray(1, 33));
  const y = uint8ArrayToUrlBase64(pub.subarray(33, 65));
  const d = uint8ArrayToUrlBase64(priv);
  return {
    publicKey: { kty: "EC", crv: "P-256", ext: true, x, y },
    privateKey: { kty: "EC", crv: "P-256", ext: true, key_ops: ["sign"], x, y, d },
  };
}

export function serializePushSubscription(subscription) {
  const json =
    subscription && typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription || {};
  const keys = json.keys || {};
  return {
    endpoint: String(json.endpoint || ""),
    p256dh: String(keys.p256dh || ""),
    auth: String(keys.auth || ""),
  };
}

export function isCompletePushSubscription(serialized) {
  return Boolean(
    serialized &&
      String(serialized.endpoint || "").trim() &&
      String(serialized.p256dh || "").trim() &&
      String(serialized.auth || "").trim(),
  );
}

export function buildWebPushDeviceUpsertPayload({
  platform = "web",
  endpoint,
  p256dh,
  auth,
  enabled = true,
  lastSeenAtIso,
}) {
  const serialized = serializePushSubscription({ endpoint, keys: { p256dh, auth } });
  if (!isCompletePushSubscription(serialized)) {
    throw new Error("PushSubscription incomplète : endpoint, p256dh et auth sont requis.");
  }
  return {
    platform: String(platform || "web"),
    provider: PUSH_PROVIDERS.webpush,
    endpoint: serialized.endpoint,
    p256dh: serialized.p256dh,
    auth: serialized.auth,
    enabled: Boolean(enabled),
    last_seen_at: lastSeenAtIso || new Date().toISOString(),
  };
}

export function isWebPushDevice(device) {
  return (
    device &&
    device.provider === PUSH_PROVIDERS.webpush &&
    isCompletePushSubscription({
      endpoint: device.endpoint,
      p256dh: device.p256dh,
      auth: device.auth,
    })
  );
}

export function isFirebaseDevice(device) {
  return Boolean(device && String(device.fcm_token || "").trim()) && device.provider !== PUSH_PROVIDERS.webpush;
}

/**
 * Explicit provider selection: if any enabled Web Push subscription exists,
 * send only via Web Push. Firebase remains a fallback when none exist.
 * This prevents duplicate Firebase + Web Push notifications.
 */
export function selectDevicesForSend(devices) {
  const enabled = (devices || []).filter((d) => d && d.enabled !== false);
  const webpush = enabled.filter(isWebPushDevice);
  if (webpush.length) {
    return {
      preferredProvider: PUSH_PROVIDERS.webpush,
      devices: webpush,
      skippedFirebase: enabled.some(isFirebaseDevice),
    };
  }
  const firebase = enabled.filter(isFirebaseDevice);
  return {
    preferredProvider: PUSH_PROVIDERS.firebase,
    devices: firebase,
    skippedFirebase: false,
  };
}

export function isStalePushStatus(status) {
  const code = Number(status);
  return code === 404 || code === 410;
}

export function endpointsToDisableFromResults(results) {
  return (results || [])
    .filter((row) => row && (row.stale || isStalePushStatus(row.status)))
    .map((row) => String(row.endpoint || ""))
    .filter(Boolean);
}

export function buildWebPushMessagePayload({
  title,
  body,
  targetUrl,
  reminderType,
  dedupKeyValue,
  tag,
}) {
  return {
    title: String(title || "Mon Bilan"),
    body: String(body || ""),
    url: String(targetUrl || "#/"),
    tag: String(tag || dedupKeyValue || "mon-bilan-push"),
    reminder_type: String(reminderType || ""),
    dedup_key: String(dedupKeyValue || ""),
    provider: PUSH_PROVIDERS.webpush,
  };
}

export function parsePushEventPayload(eventLike) {
  let raw = {};
  try {
    const data = eventLike && eventLike.data;
    if (data && typeof data.json === "function") raw = data.json() || {};
    else if (data && typeof data.text === "function") raw = JSON.parse(data.text() || "{}");
    else if (data && typeof data === "object") raw = data;
  } catch {
    raw = {};
  }

  const nested = raw.data && typeof raw.data === "object" ? raw.data : {};
  const notification = raw.notification && typeof raw.notification === "object" ? raw.notification : {};
  const title = nested.title || raw.title || notification.title || "Mon Bilan";
  const body = nested.body || raw.body || notification.body || "";
  const url = nested.url || raw.url || nested.targetUrl || raw.targetUrl || "#/";
  const tag = nested.tag || raw.tag || nested.dedup_key || raw.dedup_key || nested.dedupKey || "mon-bilan-push";
  const reminderType = nested.reminder_type || raw.reminder_type || nested.reminderType || "";
  const provider = nested.provider || raw.provider || PUSH_PROVIDERS.webpush;

  return {
    title: String(title),
    body: String(body),
    url: String(url),
    tag: String(tag),
    reminderType: String(reminderType),
    provider: String(provider),
  };
}

export function buildNotificationShowOptions(parsed, origin = "") {
  const payload = parsed || parsePushEventPayload(null);
  const iconBase = String(origin || "").replace(/\/+$/, "");
  return {
    body: payload.body,
    icon: iconBase ? `${iconBase}${WEB_PUSH_ICON_PATH}` : WEB_PUSH_ICON_PATH,
    badge: iconBase ? `${iconBase}${WEB_PUSH_BADGE_PATH}` : WEB_PUSH_BADGE_PATH,
    tag: payload.tag,
    renotify: true,
    data: {
      url: payload.url,
      reminderType: payload.reminderType,
      provider: payload.provider,
    },
  };
}

export function resolveNotificationClickUrl(url, origin) {
  const base = String(origin || "").replace(/\/+$/, "");
  const raw = String(url || "").trim();
  if (!raw || raw === "/" || raw === "#/" || raw === "#") {
    return base ? `${base}/#/` : "#/";
  }
  if (raw.startsWith("#")) {
    return base ? `${base}/${raw}` : raw;
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const hash = raw.startsWith("/#") ? raw.slice(1) : `#${raw}`;
    return base ? `${base}/${hash}` : hash;
  }
  try {
    return new URL(raw, base || undefined).href;
  } catch {
    return base ? `${base}/#/` : "#/";
  }
}

export function pathFromPushClickUrl(url) {
  if (typeof url !== "string" || !url) return "/";
  const hashIdx = url.indexOf("#");
  const hash = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
  if (!hash || hash === "/") return "/";
  return hash.startsWith("/") ? hash : `/${hash}`;
}

export function resolveNotificationClickAction({ url, origin, hasOpenClient }) {
  return {
    closeNotification: true,
    focusExisting: Boolean(hasOpenClient),
    openWindow: !hasOpenClient,
    targetUrl: resolveNotificationClickUrl(url, origin),
    path: pathFromPushClickUrl(resolveNotificationClickUrl(url, origin)),
  };
}

export function detectWebPushSupport(globals = globalThis) {
  const nav = globals.navigator || {};
  const root = globals.window || globals;
  const hasNotification = typeof globals.Notification !== "undefined";
  const hasServiceWorker = Boolean(nav.serviceWorker);
  const hasPushManager = "PushManager" in root;
  return {
    notifications: hasNotification,
    serviceWorker: hasServiceWorker,
    pushManager: Boolean(hasPushManager),
    supported: hasNotification && hasServiceWorker && Boolean(hasPushManager),
  };
}

export function isWebPushPublicKeyConfigured(value) {
  const key = String(value || "").trim();
  return Boolean(key) && !key.includes("YOUR_");
}

export function isRappelsWebPushEnabled({ permission, localSubscription, remoteDevice }) {
  return (
    permission === "granted" &&
    isCompletePushSubscription(localSubscription) &&
    Boolean(remoteDevice?.present && remoteDevice?.enabled && remoteDevice?.provider === PUSH_PROVIDERS.webpush)
  );
}

export function requiredWebPushServerEnvNames() {
  return ["WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"];
}

export function missingWebPushServerEnvNames(env = {}) {
  return requiredWebPushServerEnvNames().filter((name) => {
    const value = String(env[name] || "").trim();
    return !value || value.includes("YOUR_");
  });
}

export function normalizeWebPushSubject(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("mailto:") || value.startsWith("https://")) return value;
  return `mailto:${value}`;
}
