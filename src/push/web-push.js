import {
  applicationServerKeysEqual,
  buildRegistrationDiagnostics,
  detectWebPushSupport,
  inspectVapidPublicKey,
  isRappelsWebPushEnabled,
  isWebPushPublicKeyConfigured,
  mapWebPushSubscribeError,
  serializePushSubscription,
  shouldReuseExistingSubscription,
  vapidPublicKeyToApplicationServerKey,
} from "../../supabase/functions/_shared/web-push.js";

function readPublicWebPushKey() {
  return String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
}

export function isWebPushConfigured() {
  return isWebPushPublicKeyConfigured(readPublicWebPushKey());
}

export function getWebPushPublicKey() {
  return readPublicWebPushKey();
}

export function inspectConfiguredVapidPublicKey() {
  return inspectVapidPublicKey(readPublicWebPushKey());
}

export {
  detectWebPushSupport,
  isRappelsWebPushEnabled,
  serializePushSubscription,
  shouldReuseExistingSubscription,
};

export async function getLocalPushSubscription(registration) {
  if (!registration?.pushManager) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function waitForActiveServiceWorker(registration) {
  if (registration?.active) return registration;
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return registration;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return registration;
  }
}

export async function subscribeStandardWebPush({ serviceWorkerRegistration }) {
  const support = detectWebPushSupport();
  const vapidInspect = inspectConfiguredVapidPublicKey();
  const baseDiag = {
    permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    swReady: Boolean(serviceWorkerRegistration?.active),
    pushManager: Boolean(serviceWorkerRegistration?.pushManager || support.pushManager),
    existingSubscription: false,
    vapidInspect,
    subscribe: { ok: false, name: "pending" },
    upsert: { status: null },
  };

  const fail = (message, code, extra = {}) => {
    const error = new Error(message);
    error.code = code;
    error.diagnostics = buildRegistrationDiagnostics({ ...baseDiag, ...extra });
    throw error;
  };

  if (!support.supported) {
    fail("Rappels indisponibles sur cet appareil.", "not_supported");
  }
  const publicKey = readPublicWebPushKey();
  if (!vapidInspect.present || !vapidInspect.valid) {
    fail("Rappels indisponibles : configuration de notifications manquante.", "vapid_invalid");
  }
  if (!serviceWorkerRegistration?.pushManager) {
    fail("Rappels indisponibles sur cet appareil.", "not_supported");
  }

  const existing = await serviceWorkerRegistration.pushManager.getSubscription();
  baseDiag.existingSubscription = Boolean(existing);

  if (shouldReuseExistingSubscription(existing, publicKey)) {
    return {
      subscription: existing,
      reused: true,
      diagnostics: buildRegistrationDiagnostics({ ...baseDiag, subscribe: { ok: true } }),
    };
  }

  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      /* continue to a fresh subscribe */
    }
  }

  try {
    const subscription = await serviceWorkerRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKeyToApplicationServerKey(publicKey),
    });
    return {
      subscription,
      reused: false,
      diagnostics: buildRegistrationDiagnostics({ ...baseDiag, subscribe: { ok: true } }),
    };
  } catch (err) {
    const mapped = new Error(mapWebPushSubscribeError(err));
    mapped.name = err && err.name ? String(err.name) : "Error";
    mapped.code = "subscribe_failed";
    mapped.diagnostics = buildRegistrationDiagnostics({
      ...baseDiag,
      subscribe: { ok: false, name: mapped.name, message: err instanceof Error ? err.message : String(err || "") },
    });
    throw mapped;
  }
}

export { applicationServerKeysEqual, buildRegistrationDiagnostics };
