import { navigate } from "../router.js";
import { escapeHtml } from "../utils/errors.js";

export function showForegroundNotification({ title, body, url }) {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const hashIdx = typeof url === "string" ? url.indexOf("#") : -1;
  const hash = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
  const path = hash ? (hash.startsWith("/") ? hash : `/${hash}`) : null;

  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div style="font-weight:600; margin-bottom:0.25rem">${escapeHtml(title || "Rappel")}</div>
    <div style="opacity:0.9">${escapeHtml(body || "")}</div>
    ${
      path
        ? `<button type="button" class="btn btn-secondary" data-action="open" style="margin-top:0.75rem">Ouvrir</button>`
        : ""
    }
  `;

  root.appendChild(el);

  el.querySelector('[data-action="open"]')?.addEventListener("click", () => {
    if (path) navigate(path);
    el.remove();
  });

  window.setTimeout(() => el.remove(), 5200);
}

