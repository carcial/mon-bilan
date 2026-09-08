/**
 * Predictable in-app back navigation.
 * Prefer the previous route in the same flow; otherwise the logical parent.
 */

/** @type {string[]} */
let stack = [];

export function resetBackStack() {
  stack = [];
}

export function getBackStack() {
  return [...stack];
}

export function rememberPath(path) {
  const clean = normalizePath(path);
  if (!clean) return;
  const existing = stack.lastIndexOf(clean);
  if (existing >= 0) {
    stack = stack.slice(0, existing + 1);
    return;
  }
  stack.push(clean);
  if (stack.length > 40) stack = stack.slice(-40);
}

export function navDomain(path) {
  const p = normalizePath(path);
  if (p.startsWith("/commerce")) return "business";
  if (p.startsWith("/eglise")) return "church";
  if (p.startsWith("/historique")) return "history";
  if (p.startsWith("/plus")) return "more";
  if (p === "/" || p === "") return "home";
  return "other";
}

export function backLabelForPath(path, fallback = "Retour") {
  const clean = normalizePath(path);
  const exact = {
    "/": "Retour à l'accueil",
    "/commerce": "Retour au commerce",
    "/commerce/clients": "Retour aux clients",
    "/commerce/fournisseurs": "Retour aux fournisseurs",
    "/commerce/produits": "Retour aux produits",
    "/commerce/a-recevoir": "Retour aux paiements",
    "/commerce/a-payer": "Retour à payer",
    "/commerce/depenses": "Retour aux dépenses",
    "/commerce/stock": "Retour au stock",
    "/commerce/bordereaux": "Retour aux bordereaux",
    "/commerce/historique": "Retour à l'historique",
    "/commerce/rapport": "Retour au rapport",
    "/eglise": "Retour à Église",
    "/eglise/historique": "Retour à l'historique",
    "/eglise/rapprochements": "Retour aux vérifications",
    "/eglise/rapport": "Retour au rapport",
    "/historique": "Retour à l'historique",
    "/plus": "Retour à Plus",
    "/plus/rapport": "Retour au rapport",
  };
  if (exact[clean]) return exact[clean];
  if (clean.startsWith("/commerce/clients/")) return "Retour au client";
  if (clean.startsWith("/commerce/fournisseurs/")) return "Retour au fournisseur";
  if (clean.startsWith("/commerce/vente/")) return "Retour à la vente";
  if (clean.startsWith("/eglise/operation/")) return "Retour à l'opération";
  return fallback;
}

export function isValidBackTarget(prev, current) {
  const from = normalizePath(prev);
  const to = normalizePath(current);
  if (!from || !to || from === to) return false;
  // List pages must not return to their create/sub-flow (e.g. Dépenses ← Nouvelle dépense).
  if (from.startsWith(`${to}/`) && /\/(nouvelle|nouveau|paiement|ajustement)$/.test(from)) {
    return false;
  }
  const dPrev = navDomain(from);
  const dCur = navDomain(to);
  if (dPrev === "home") {
    return dCur !== "home";
  }
  if (dPrev === dCur) return true;
  return dPrev === "history" || dCur === "history";
}

/**
 * @param {string} parentHref
 * @param {string} [parentLabel]
 * @returns {{ href: string, label: string }}
 */
export function resolveBack(parentHref, parentLabel = "Retour") {
  const parent = normalizePath(parentHref) || "/";
  const current = stack[stack.length - 1] || "";
  const prev = stack[stack.length - 2] || "";
  if (isValidBackTarget(prev, current)) {
    return { href: prev, label: backLabelForPath(prev, parentLabel) };
  }
  return { href: parent, label: parentLabel || backLabelForPath(parent, "Retour") };
}

function normalizePath(path) {
  const raw = String(path || "").split("?")[0];
  if (!raw) return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}
