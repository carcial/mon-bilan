import {
  detectWebPushSupport,
  isCompletePushSubscription,
  isRappelsWebPushEnabled,
  isWebPushPublicKeyConfigured,
  serializePushSubscription,
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

export { detectWebPushSupport, isRappelsWebPushEnabled, serializePushSubscription };

function applicationServerKeysEqual(left, rightKey) {
  if (!left) return false;
  try {
    const expected = vapidPublicKeyToApplicationServerKey(rightKey);
    const current = left instanceof Uint8Array ? left : new Uint8Array(left);
    if (current.length !== expected.length) return false;
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== expected[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getLocalPushSubscription(registration) {
  if (!registration?.pushManager) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeStandardWebPush({ serviceWorkerRegistration }) {
  const support = detectWebPushSupport();
  if (!support.supported) {
    throw new Error("Rappels indisponibles sur cet appareil.");
  }
  const publicKey = readPublicWebPushKey();
  if (!isWebPushPublicKeyConfigured(publicKey)) {
    throw new Error("Rappels indisponibles : configuration de notifications manquante.");
  }
  if (!serviceWorkerRegistration?.pushManager) {
    throw new Error("Rappels indisponibles sur cet appareil.");
  }

  const existing = await serviceWorkerRegistration.pushManager.getSubscription();
  if (existing) {
    const sameKey = applicationServerKeysEqual(existing.options?.applicationServerKey, publicKey);
    if (sameKey && isCompletePushSubscription(serializePushSubscription(existing))) {
      return existing;
    }
    await existing.unsubscribe();
  }

  return serviceWorkerRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKeyToApplicationServerKey(publicKey),
  });
}
