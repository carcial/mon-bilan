import { navigate } from "../router.js";

export function installPushClickRouting() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type !== "PUSH_NOTIFICATION_CLICK") return;

    const url = data.url;
    if (typeof url !== "string") return;

    const hashIdx = url.indexOf("#");
    const hash = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
    if (!hash) return;

    const path = hash.startsWith("/") ? hash : `/${hash}`;
    navigate(path);
  });
}

