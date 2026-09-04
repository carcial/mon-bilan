import { ROUTES, navigate, matchRoute } from "../router.js";
import { iconHtml } from "./icons.js";
import { APP_MODES, getAppMode } from "../state/app-mode.js";

const ITEMS = [
  { id: "home", path: ROUTES.home, label: "Accueil", icon: "house" },
  { id: "history", path: ROUTES.history, label: "Historique", icon: "clock-counter-clockwise" },
  { id: "reports", path: ROUTES.moreReport, label: "Rapports", icon: "chart-bar" },
  { id: "more", path: ROUTES.more, label: "Plus", icon: "dots-three" },
];

function activeId(path) {
  if (path === ROUTES.moreReport || path.endsWith("/rapport")) return "reports";
  if (path === "/" || path === ROUTES.church || path === ROUTES.business) return "home";
  const route = matchRoute(path);
  if (route === "history") return "history";
  if (route === "more") return "more";
  return "";
}

/**
 * @param {HTMLElement} container
 * @param {string} activePath
 * @param {{ variant?: 'bar' | 'sidebar' }} [options]
 */
export function renderBottomNav(container, activePath, options = {}) {
  const active = activeId(activePath);
  const sidebar = options.variant === "sidebar";
  const mode = getAppMode();

  const links = ITEMS.map((item) => {
    const isActive = item.id === active;
    const weight = isActive ? "fill" : "regular";
    return `
      <a
        class="${sidebar ? "sidebar-nav-item" : "bottom-nav-item"}${isActive ? " is-active" : ""}"
        href="#${item.path}"
        data-path="${item.path}"
        aria-current="${isActive ? "page" : "false"}"
      >
        <span class="nav-icon" aria-hidden="true">${iconHtml(item.icon, { weight, size: "md" })}</span>
        <span class="nav-label">${item.label}</span>
      </a>
    `;
  }).join("");

  container.innerHTML = sidebar
    ? `
      <div class="sidebar-brand">
        <strong>Mon Bilan</strong>
        <span>${mode === APP_MODES.church ? "Trésorerie église" : "Activité commerce"}</span>
      </div>
      <nav class="sidebar-nav" aria-label="Navigation principale">${links}</nav>
    `
    : links;

  container.querySelectorAll("[data-path]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(el.getAttribute("data-path"));
    });
  });
}
