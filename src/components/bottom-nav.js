import { ROUTES, navigate, matchRoute } from "../router.js";

const ITEMS = [
  { id: "home", path: ROUTES.home, label: "Accueil", icon: "⌂" },
  { id: "church", path: ROUTES.church, label: "Église", icon: "⛪" },
  { id: "business", path: ROUTES.business, label: "Commerce", icon: "🛒" },
  { id: "history", path: ROUTES.history, label: "Historique", icon: "◷" },
  { id: "more", path: ROUTES.more, label: "Plus", icon: "⋯" },
];

/**
 * @param {HTMLElement} container
 * @param {string} activePath
 */
export function renderBottomNav(container, activePath) {
  const active = matchRoute(activePath);

  container.innerHTML = ITEMS.map((item) => {
    const isActive = item.id === active;
    return `
      <a
        class="bottom-nav-item${isActive ? " is-active" : ""}"
        href="#${item.path}"
        data-path="${item.path}"
        aria-current="${isActive ? "page" : "false"}"
      >
        <span class="nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </a>
    `;
  }).join("");

  container.querySelectorAll("[data-path]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(el.getAttribute("data-path"));
    });
  });
}
