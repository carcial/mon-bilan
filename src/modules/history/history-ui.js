import { escapeHtml } from "../../utils/errors.js";
import { HISTORY_TYPE_LABELS } from "../../utils/history-events.js";

export function backLinkHtml(href, label = "Retour") {
  return `
    <a class="back-link" href="#${href}">
      <span aria-hidden="true">←</span> ${escapeHtml(label)}
    </a>
  `;
}

export function pageHeaderHtml({ kicker, title, subtitle, backHref, backLabel, titleId = "history-title" }) {
  return `
    <header class="page-header">
      ${backHref ? backLinkHtml(backHref, backLabel || "Retour") : ""}
      ${kicker ? `<p class="page-kicker">${escapeHtml(kicker)}</p>` : ""}
      <h1 class="page-title" id="${titleId}">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </header>
  `;
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
    return `<span class="origin-badge origin-business"><span aria-hidden="true">🛒</span> COMMERCE</span>`;
  }
  return `<span class="origin-badge origin-church"><span aria-hidden="true">⛪</span> ÉGLISE</span>`;
}

export function typeBadgeHtml(type) {
  const label = HISTORY_TYPE_LABELS[type] || type;
  const isOut = type === "expense" || type === "supplier_payment" || type === "business_expense" || type === "arrival";
  const isIn = type === "income" || type === "sale" || type === "customer_payment";
  const cls = isOut ? "tx-kind-out" : isIn ? "tx-kind-in" : "tx-kind-neutral";
  const icon = isOut ? "↓" : isIn ? "↑" : "•";
  return `<span class="tx-kind ${cls}"><span aria-hidden="true">${icon}</span> ${escapeHtml(label.toUpperCase())}</span>`;
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
