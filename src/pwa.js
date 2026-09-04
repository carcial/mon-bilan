/**
 * Production-only service worker registration and a simple update prompt.
 */

function showUpdateBanner(registration) {
  if (document.getElementById("pwa-update")) return;
  const banner = document.createElement("div");
  banner.id = "pwa-update";
  banner.className = "pwa-update";
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <p>Une nouvelle version est prête.</p>
    <button type="button" class="btn btn-primary btn-block" data-action="refresh">Actualiser</button>
  `;
  banner.querySelector("[data-action=refresh]")?.addEventListener("click", () => {
    registration.waiting?.postMessage("SKIP_WAITING");
  });
  document.body.appendChild(banner);
}

export function getServiceWorkerUrl() {
  return `${import.meta.env.BASE_URL}sw.js`;
}

export async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Rappels indisponibles sur cet appareil.");
  }
  return navigator.serviceWorker.register(getServiceWorkerUrl());
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  const swUrl = getServiceWorkerUrl();

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(swUrl);

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    } catch (err) {
      console.warn("[pwa] SW registration failed", err);
    }
  });
}
