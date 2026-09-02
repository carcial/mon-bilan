/**
 * Church sub-routes under #/eglise/...
 */

export function matchChurchRoute(path) {
  const pathname = String(path || "").split("?")[0];
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts[0] === "eglise" ? parts.slice(1) : parts;

  if (rest.length === 0) return { name: "dashboard" };

  const [head, id, tail] = rest;

  if (head === "entree") return { name: "income" };
  if (head === "sortie") return { name: "expense" };
  if (head === "historique") return { name: "history" };
  if (head === "rapport") return { name: "report" };
  if (head === "rapprochement") return { name: "reconciliation" };
  if (head === "rapprochements") return { name: "reconciliation" };
  if (head === "succes" && id) return { name: "success", id };
  if (head === "operation" && id && tail === "modifier") {
    return { name: "edit", id };
  }
  if (head === "operation" && id) return { name: "detail", id };

  return { name: "dashboard" };
}

export function churchOperationPath(id) {
  return `/eglise/operation/${id}`;
}

export function churchEditPath(id) {
  return `/eglise/operation/${id}/modifier`;
}

export function churchSuccessPath(id) {
  return `/eglise/succes/${id}`;
}
