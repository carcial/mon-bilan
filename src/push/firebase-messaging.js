import { initializeApp, getApps } from "firebase/app";
import {
  getMessaging,
  isSupported,
  onMessage,
  onRegistered,
  onUnregistered,
  register,
} from "firebase/messaging";
import { missingPublicFirebaseEnvNames } from "../../supabase/functions/_shared/fcm-auth.js";

let messaging = null;
let foregroundListenerStarted = false;
let registrationListenerStarted = false;

function readPublicFirebaseEnv() {
  return {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_VAPID_KEY: import.meta.env.VITE_FIREBASE_VAPID_KEY,
  };
}

function getFirebaseWebConfig() {
  const env = readPublicFirebaseEnv();
  if (missingPublicFirebaseEnvNames(env).length) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    vapidKey: env.VITE_FIREBASE_VAPID_KEY,
  };
}

export function isFirebaseMessagingConfigured() {
  return Boolean(getFirebaseWebConfig());
}

function initMessaging() {
  const cfg = getFirebaseWebConfig();
  if (!cfg) return null;
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  messaging = getMessaging(app);
  return messaging;
}

function waitForRegistrationId(timeoutMs = 20000) {
  if (!messaging) initMessaging();
  if (!messaging) {
    return Promise.reject(new Error("Rappels indisponibles : configuration de notifications manquante."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unsub();
      fn(value);
    };

    const unsub = onRegistered(messaging, (fid) => {
      if (fid) finish(resolve, String(fid));
    });

    const timer = window.setTimeout(() => {
      finish(reject, new Error("Impossible d'obtenir un code de notification pour cet appareil."));
    }, timeoutMs);
  });
}

/**
 * Current Firebase Web Messaging registration: register() + onRegistered() → FID.
 * FCM HTTP v1 targets this identifier via `fid`, not the deprecated `token` field.
 */
export async function registerFcmInstallation({ serviceWorkerRegistration }) {
  if (!(await isSupported())) {
    throw new Error("Rappels indisponibles sur cet appareil.");
  }
  if (!messaging) initMessaging();
  if (!messaging) {
    throw new Error("Rappels indisponibles : configuration de notifications manquante.");
  }

  const cfg = getFirebaseWebConfig();
  const pending = waitForRegistrationId();
  await register(messaging, {
    vapidKey: cfg.vapidKey,
    serviceWorkerRegistration,
  });
  return pending;
}

export function ensureForegroundListener({ onMessageData }) {
  if (!messaging) initMessaging();
  if (!messaging || foregroundListenerStarted) return;
  foregroundListenerStarted = true;

  onMessage(messaging, (payload) => {
    const data = payload?.data || {};
    const title = data.title;
    const body = data.body;
    const url = data.url;
    if (!title && !body) return;
    onMessageData?.({
      title,
      body,
      url,
      reminderType: data.reminder_type,
      dedupKeyValue: data.dedup_key,
    });
  });
}

export function ensureRegistrationChangeListener({ onFid, onUnregisteredFid }) {
  if (!messaging) initMessaging();
  if (!messaging || registrationListenerStarted) return;
  registrationListenerStarted = true;

  onRegistered(messaging, (fid) => {
    if (fid) onFid?.(String(fid));
  });
  onUnregistered(messaging, (fid) => {
    if (fid) onUnregisteredFid?.(String(fid));
  });
}
