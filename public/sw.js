/* Mon Bilan service worker
 * - Cache app shell and static assets only, never Supabase data
 * - Background push reminders via Firebase Messaging (same worker, same scope)
 *
 * Firebase public web config is injected at build/dev time.
 * Never put service-account keys here.
 */
const CACHE_VERSION = "mon-bilan-shell-v4";
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
    messaging.onBackgroundMessage((payload) => {
      const data = (payload && payload.data) || {};
      const title = data.title || "Rappel";
      const body = data.body || "";
      const url = data.url;
      const tag = data.dedup_key || "push";
      self.registration.showNotification(title, {
        body,
        tag,
        data: { url },
      });
    });
  } catch (_err) {
    /* keep caching working even if messaging scripts fail */
  }
}

self.addEventListener("notificationclick", (event) => {
  const url = event.notification && event.notification.data && event.notification.data.url;
  event.notification.close();
  if (!url) return;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const origin = self.location.origin;
      const sameOriginClient = allClients.find((c) => c.url && c.url.startsWith(origin));
      if (sameOriginClient) {
        sameOriginClient.postMessage({ type: "PUSH_NOTIFICATION_CLICK", url });
        sameOriginClient.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
