/**
 * UI helpers for selects, filters and customer typing.
 * No financial calculations.
 */

export function normalizePersonName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function findCustomerByName(customers, name) {
  const key = normalizePersonName(name);
  if (!key) return null;
  return (customers || []).find((row) => normalizePersonName(row.name) === key) || null;
}

export function filterCustomersByQuery(customers, query, limit = 8) {
  const q = normalizePersonName(query);
  const rows = customers || [];
  if (!q) return rows.slice(0, limit);
  return rows.filter((row) => normalizePersonName(row.name).includes(q)).slice(0, limit);
}

export function customerComboboxState(customers, query, { allowCreate = true } = {}) {
  const trimmed = String(query || "").replace(/\s+/g, " ").trim();
  const exact = findCustomerByName(customers, trimmed);
  const matches = filterCustomersByQuery(customers, trimmed);
  return {
    query: trimmed,
    matches,
    exact,
    canCreate: allowCreate && Boolean(trimmed) && !exact,
    createLabel: trimmed ? `Créer « ${trimmed} »` : "",
  };
}

/**
 * Decide whether a sale should reuse an existing customer or create one.
 */
export function resolveSaleCustomer(input = {}, customers = []) {
  const customerId = String(input.customerId || "").trim();
  if (customerId) {
    return { customerId, shouldCreate: false, name: null };
  }
  const exact = findCustomerByName(customers, input.newCustomerName);
  if (exact) {
    return { customerId: exact.id, shouldCreate: false, name: exact.name };
  }
  const name = String(input.newCustomerName || "").trim();
  if (name) {
    return { customerId: null, shouldCreate: true, name };
  }
  return { customerId: null, shouldCreate: false, name: null };
}

export function choiceMode(options) {
  const count = Array.isArray(options) ? options.length : 0;
  if (count === 0) return "empty";
  if (count === 1) return "single";
  return "many";
}

/** Filters: only show a dropdown when the user has more than one real option. */
export function isMeaningfulFilterList(items) {
  return Array.isArray(items) && items.length > 1;
}

/**
 * Keep a popover inside the visible viewport with page margins.
 * @param {{ top: number, bottom: number, left: number, right: number }} anchorRect
 * @param {{ width: number, height: number }} viewport
 */
export function panelViewportPlacement(
  anchorRect,
  viewport,
  { margin = 12, minOpen = 128, maxHeight = 224 } = {},
) {
  const spaceBelow = Math.max(0, viewport.height - anchorRect.bottom - margin);
  const spaceAbove = Math.max(0, anchorRect.top - margin);
  const openUp = spaceBelow < minOpen && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const left = Math.min(
    Math.max(margin, anchorRect.left),
    Math.max(margin, viewport.width - margin),
  );
  const rightEdge = Math.max(left, Math.min(viewport.width - margin, anchorRect.right));
  return {
    openUp,
    maxHeight: Math.max(96, Math.min(maxHeight, available || maxHeight)),
    maxWidth: Math.max(0, rightEdge - left),
  };
}

export function fitPanelToViewport(panel, anchor, options = {}) {
  if (!panel || !anchor || typeof window === "undefined") return;
  const placement = panelViewportPlacement(
    anchor.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight },
    options,
  );
  panel.style.top = placement.openUp ? "auto" : "calc(100% + 0.35rem)";
  panel.style.bottom = placement.openUp ? "calc(100% + 0.35rem)" : "auto";
  panel.style.maxHeight = `${placement.maxHeight}px`;
  panel.style.left = "0";
  panel.style.right = "0";
  panel.style.width = "100%";
  panel.style.maxWidth = "100%";
  panel.style.minWidth = "0";
  panel.style.boxSizing = "border-box";
}
