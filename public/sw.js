/* Mon Bilan service worker
 * - Cache app shell and static assets only, never Supabase data
 * - Standard Web Push (Push API) is the primary notification transport
 * - Firebase Messaging remains temporarily for fallback comparison
 *
 * Firebase public web config is injected at build/dev time.
 * Never put service-account keys or VAPID private keys here.
 */
const CACHE_VERSION = "mon-bilan-shell-v5";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isFinancialRequest(url) {
  return url.hostname.includes("supabase.co") || url.pathname.includes("/rest/v1/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isFinancialRequest(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isStatic =
    sameOrigin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.endsWith(".webmanifest") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js"));

  if (!isStatic && !sameOrigin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});

const firebaseConfig = {
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
};

const hasFirebase =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.authDomain) &&
  Boolean(firebaseConfig.projectId) &&
  Boolean(firebaseConfig.storageBucket) &&
  Boolean(firebaseConfig.messagingSenderId) &&
  Boolean(firebaseConfig.appId);

if (hasFirebase) {
  try {
    importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");
    const app = firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging(app);
    messaging.onBackgroundMessage(() => {
      // Display is handled by the standard `push` listener below so Safari
      // always gets a visible notification and we do not double-show FCM + Web Push.
    });
  } catch (_err) {
    /* keep caching working even if messaging scripts fail */
  }
}

function parsePushEventPayload(event) {
  let raw = {};
  try {
    const data = event && event.data;
    if (data && typeof data.json === "function") raw = data.json() || {};
    else if (data && typeof data.text === "function") raw = JSON.parse(data.text() || "{}");
  } catch (_err) {
    raw = {};
  }
  const nested = raw.data && typeof raw.data === "object" ? raw.data : {};
  const notification = raw.notification && typeof raw.notification === "object" ? raw.notification : {};
  return {
    title: String(nested.title || raw.title || notification.title || "Mon Bilan"),
    body: String(nested.body || raw.body || notification.body || ""),
    url: String(nested.url || raw.url || nested.targetUrl || raw.targetUrl || "#/"),
    tag: String(nested.tag || raw.tag || nested.dedup_key || raw.dedup_key || "mon-bilan-push"),
    reminderType: String(nested.reminder_type || raw.reminder_type || nested.reminderType || ""),
    provider: String(nested.provider || raw.provider || "webpush"),
  };
}

function resolveNotificationClickUrl(url, origin) {
  const base = String(origin || "").replace(/\/+$/, "");
  const raw = String(url || "").trim();
  if (!raw || raw === "/" || raw === "#/" || raw === "#") return `${base}/#/`;
  if (raw.startsWith("#")) return `${base}/${raw}`;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const hash = raw.startsWith("/#") ? raw.slice(1) : `#${raw}`;
    return `${base}/${hash}`;
  }
  try {
    return new URL(raw, base).href;
  } catch (_err) {
    return `${base}/#/`;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const parsed = parsePushEventPayload(event);
      await self.registration.showNotification(parsed.title, {
        body: parsed.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: parsed.tag,
        renotify: true,
        data: {
          url: parsed.url,
          reminderType: parsed.reminderType,
          provider: parsed.provider,
        },
      });
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({
          type: "PUSH_NOTIFICATION_RECEIVED",
          title: parsed.title,
          body: parsed.body,
          url: parsed.url,
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = (event.notification && event.notification.data) || {};
  event.notification.close();
  const origin = self.location.origin;
  const targetUrl = resolveNotificationClickUrl(data.url, origin);

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const sameOriginClient = allClients.find((c) => c.url && c.url.startsWith(origin));
      if (sameOriginClient) {
        sameOriginClient.postMessage({ type: "PUSH_NOTIFICATION_CLICK", url: targetUrl });
        await sameOriginClient.focus();
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
