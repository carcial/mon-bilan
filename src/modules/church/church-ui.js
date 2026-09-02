/**
 * Shared Church UI helpers.
 */

import { formatFcfa } from "../../utils/money.js";
import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";

export function backLinkHtml(href, label = "Retour") {
  return `
    <a class="back-link" href="#${href}">
      <span aria-hidden="true">←</span> ${escapeHtml(label)}
    </a>
  `;
}

export function pageHeaderHtml({ kicker, title, subtitle, backHref, backLabel }) {
  return `
    <header class="page-header">
      ${backHref ? backLinkHtml(backHref, backLabel || "Retour à Église") : ""}
      ${kicker ? `<p class="page-kicker">${escapeHtml(kicker)}</p>` : ""}
      <h1 class="page-title" id="church-title">${escapeHtml(title)}</h1>
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

export function fundName(fund) {
  return fund?.name || "Caisse";
}

export function fundSelectHtml(funds, selectedId, { includeAll, allLabel } = {}) {
  const options = [];
  if (includeAll) {
    options.push(
      `<option value="">${escapeHtml(allLabel || "Toutes les caisses")}</option>`,
    );
  }
  for (const fund of funds) {
    const selected = fund.id === selectedId ? " selected" : "";
    options.push(
      `<option value="${escapeHtml(fund.id)}"${selected}>${escapeHtml(fund.name)}</option>`,
    );
  }
  return options.join("");
}

export function typeLabel(type) {
  return type === "expense" ? "Sortie" : "Entrée";
}

export function typeBadgeHtml(type) {
  if (type === "expense") {
    return `<span class="tx-kind tx-kind-out"><span aria-hidden="true">↓</span> SORTIE</span>`;
  }
  return `<span class="tx-kind tx-kind-in"><span aria-hidden="true">↑</span> ENTRÉE</span>`;
}

export function noteIndicatorHtml(note) {
  if (!note || !String(note).trim()) return "";
  return `<span class="tx-note-flag">Note</span>`;
}

/**
 * Format integer FCFA in a text input while typing.
 * @param {HTMLInputElement} input
 */
export function bindMoneyInput(input) {
  const apply = () => {
    const raw = input.value;
    const digits = raw.replace(/\s/g, "").replace(/[^\d]/g, "");
    if (!digits) {
      input.value = "";
      input.dataset.amount = "";
      return;
    }
    const n = Number.parseInt(digits, 10);
    input.dataset.amount = String(n);
    input.value = formatFcfa(n, { showCurrency: false });
  };

  input.addEventListener("input", apply);
  if (input.value) apply();
}

export function fieldErrorHtml(id, message) {
  if (!message) return `<p class="field-error" id="${id}" hidden></p>`;
  return `<p class="field-error" id="${id}">${escapeHtml(message)}</p>`;
}

export function setFieldError(form, name, message) {
  const el = form.querySelector(`[data-error="${name}"]`);
  if (!el) return;
  if (message) {
    el.hidden = false;
    el.textContent = message;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

export function clearFieldErrors(form) {
  form.querySelectorAll("[data-error]").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

export const CHURCH_LINKS = {
  home: ROUTES.church,
  income: ROUTES.churchIncome,
  expense: ROUTES.churchExpense,
  history: ROUTES.churchHistory,
  reconciliation: ROUTES.churchReconciliation,
  report: ROUTES.churchReport,
};
