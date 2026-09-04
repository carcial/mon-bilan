import { escapeHtml } from "../../utils/errors.js";
import { HISTORY_TYPE_LABELS } from "../../utils/history-events.js";
import { iconHtml } from "../../components/icons.js";
import { pageHeaderHtml as sharedPageHeaderHtml, backLinkHtml } from "../../components/page-header.js";

export { backLinkHtml };

export function pageHeaderHtml(props = {}) {
  return sharedPageHeaderHtml({
    titleId: "history-title",
    ...props,
  });
}

export function skeletonHtml(lines = 3) {
  const items = Array.from({ length: lines }, (_, i) => {
    const wide = i === 0 ? " skeleton-line-lg" : "";
    return `<div class="skeleton-line${wide}"></div>`;
  }).join("");
  return `<div class="card skeleton-card" aria-hidden="true">${items}</div>`;
}

export function emptyStateHtml({ title, body, actionHref, actionLabel }) {
  return `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${
        actionHref && actionLabel
          ? `<a class="btn btn-primary" href="#${actionHref}">${escapeHtml(actionLabel)}</a>`
          : ""
      }
    </div>
  `;
}

export function errorStateHtml(message) {
  return `
    <div class="empty-state empty-state-error" role="alert">
      <h2>Impossible de charger</h2>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary" data-action="retry">Réessayer</button>
    </div>
  `;
}

export function domainBadgeHtml(domain) {
  if (domain === "business") {
    return `<span class="origin-badge origin-business">${iconHtml("storefront", { weight: "fill", size: "sm" })} COMMERCE</span>`;
  }
  return `<span class="origin-badge origin-church">${iconHtml("church", { weight: "fill", size: "sm" })} ÉGLISE</span>`;
}

export function typeBadgeHtml(type) {
  const label = HISTORY_TYPE_LABELS[type] || type;
  const isOut = type === "expense" || type === "supplier_payment" || type === "business_expense" || type === "arrival";
  const isIn = type === "income" || type === "sale" || type === "customer_payment";
  const cls = isOut ? "tx-kind-out" : isIn ? "tx-kind-in" : "tx-kind-neutral";
  const icon = isOut ? "arrow-up" : isIn ? "arrow-down" : "dot";
  return `<span class="tx-kind ${cls}">${iconHtml(icon, { weight: "bold", size: "sm" })} ${escapeHtml(label.toUpperCase())}</span>`;
}

export function selectOptionsHtml(rows, selectedId, { valueKey = "id", labelFn, includeAll, allLabel } = {}) {
  const options = [];
  if (includeAll) {
    options.push(`<option value="">${escapeHtml(allLabel || "Tous")}</option>`);
  }
  for (const row of rows) {
    const value = row[valueKey];
    const selected = value === selectedId ? " selected" : "";
    options.push(
      `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(labelFn(row))}</option>`,
    );
  }
  return options.join("");
}
