/**
 * Hash-based SPA router — works on static Cloudflare Pages without rewrites.
 * Routes: #/ , #/eglise , #/commerce , #/historique , #/plus
 */

const listeners = new Set();

export const ROUTES = {
  home: "/",
  church: "/eglise",
  churchIncome: "/eglise/entree",
  churchExpense: "/eglise/sortie",
  churchHistory: "/eglise/historique",
  churchReconciliation: "/eglise/rapprochement",
  churchReconciliations: "/eglise/rapprochements",
  churchReport: "/eglise/rapport",
  business: "/commerce",
  businessSale: "/commerce/vente",
  businessArrival: "/commerce/arrivee",
  businessHistory: "/commerce/historique",
  businessReport: "/commerce/rapport",
  history: "/historique",
  more: "/plus",
  moreReport: "/plus/rapport",
  moreExport: "/plus/export",
  moreActivity: "/plus/activite",
};

export function getHashPath() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const path = raw.split("?")[0];
  return path.startsWith("/") ? path : `/${path}`;
}

export function getHashQuery() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const query = raw.split("?")[1] || "";
  return new URLSearchParams(query);
}

export function navigate(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (getHashPath() === normalized) {
    notify();
    return;
  }
  window.location.hash = `#${normalized}`;
}

export function onRouteChange(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

function notify() {
  const path = getHashPath();
  listeners.forEach((fn) => fn(path));
}

export function startRouter() {
  window.addEventListener("hashchange", notify);
  if (!window.location.hash) {
    window.location.hash = "#/";
  } else {
    notify();
  }
}

export function matchRoute(path) {
  if (path === ROUTES.home || path === "") return "home";
  if (path.startsWith(ROUTES.church)) return "church";
  if (path.startsWith(ROUTES.business)) return "business";
  if (path.startsWith(ROUTES.history)) return "history";
  if (path.startsWith(ROUTES.more)) return "more";
  return "home";
}
