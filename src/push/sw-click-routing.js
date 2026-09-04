import { navigate } from "../router.js";
import { pathFromPushClickUrl } from "../../supabase/functions/_shared/web-push.js";
import { showForegroundNotification } from "./foreground-notification.js";

export function installPushClickRouting() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "PUSH_NOTIFICATION_RECEIVED") {
      if (document.visibilityState === "visible") {
        showForegroundNotification({ title: data.title, body: data.body, url: data.url });
      }
      return;
    }
    if (data.type !== "PUSH_NOTIFICATION_CLICK") return;

    const path = pathFromPushClickUrl(data.url);
    navigate(path);
  });
}

