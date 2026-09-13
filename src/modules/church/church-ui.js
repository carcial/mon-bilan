/**
 * Shared Church UI helpers.
 */

import { amountHtml } from "../../components/amount.js";
import { formatFcfa, formatFcfaSigned } from "../../utils/money.js";
import { formatNumericDateFr } from "../../utils/dates.js";
import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";
import { iconHtml } from "../../components/icons.js";
import { pageHeaderHtml as sharedPageHeaderHtml, backLinkHtml } from "../../components/page-header.js";
import { churchOperationPath } from "./church-routes.js";

export { backLinkHtml };

export function pageHeaderHtml(props = {}) {
  return sharedPageHeaderHtml({
    kicker: "Église",
    backLabel: "Retour à Église",
    titleId: "church-title",
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
    return `<span class="tx-kind tx-kind-out">${iconHtml("arrow-up", { weight: "bold", size: "sm" })} SORTIE</span>`;
  }
  return `<span class="tx-kind tx-kind-in">${iconHtml("arrow-down", { weight: "bold", size: "sm" })} ENTRÉE</span>`;
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
  weekIncome: `${ROUTES.churchHistory}?period=week&type=income`,
  weekExpense: `${ROUTES.churchHistory}?period=week&type=expense`,
};

/**
 * Home markup — weekly flow and cumulative balances stay separate.
 * @param {{
 *   funds?: Array<{ id?: string, name?: string, balance?: number }>,
 *   total: number,
 *   weekly: { incomeTotal: number, expenseTotal: number, netMovement: number },
 * }} model
 */
export function churchHomeHtml({ total, weekly }) {
  return `
    <div class="church-home">
      <section class="church-week-block" aria-label="Cette semaine">
        <a class="church-week-income" href="#${CHURCH_LINKS.weekIncome}">
          <span class="church-week-label">Entrées de la semaine</span>
          <span class="church-week-income-amount">${amountHtml(weekly.incomeTotal)}</span>
        </a>
        <div class="church-week-pair">
          <a class="church-week-card" href="#${CHURCH_LINKS.weekExpense}">
            <span class="church-week-label">Sorties</span>
            <strong class="church-week-card-amount">${escapeHtml(formatFcfa(weekly.expenseTotal))}</strong>
          </a>
          <div class="church-week-card${weekly.netMovement < 0 ? " is-negative" : ""}">
            <span class="church-week-label">Solde de la semaine</span>
            <strong class="church-week-card-amount">${escapeHtml(
              weekly.netMovement < 0 ? formatFcfaSigned(weekly.netMovement) : formatFcfa(weekly.netMovement),
            )}</strong>
          </div>
        </div>
      </section>

      <section class="section-block church-home-actions">
        <h2 class="section-title">Actions</h2>
        <div class="actions-grid church-actions-grid">
          ${actionTile(CHURCH_LINKS.income, "arrow-down", "Enregistrer une entrée")}
          ${actionTile(CHURCH_LINKS.expense, "arrow-up", "Enregistrer une sortie")}
        </div>
        <div class="secondary-actions">
          <a class="btn btn-ghost" href="#${CHURCH_LINKS.reconciliation}">
            ${iconHtml("check-circle", { weight: "bold", size: "sm" })} Vérifier la caisse
          </a>
          <a class="btn btn-ghost" href="#${CHURCH_LINKS.history}">
            ${iconHtml("clock-counter-clockwise", { weight: "bold", size: "sm" })} Historique
          </a>
          <a class="btn btn-ghost" href="#${ROUTES.moreReport}">
            ${iconHtml("chart-bar", { weight: "bold", size: "sm" })} Rapports
          </a>
        </div>
      </section>

      <article class="card church-total-card">
        <p class="church-total-kicker">Solde actuel total</p>
        <div class="church-total-amount">${amountHtml(total)}</div>
      </article>

      <article class="chart-card church-week-chart">
        <h2 class="section-title">Mouvement de la semaine</h2>
        <div class="chart-frame">
          <canvas data-role="flow-chart" aria-label="Entrées et sorties de la semaine"></canvas>
        </div>
      </article>
    </div>
  `;
}

function actionTile(href, icon, label) {
  return `
    <a class="action-card action-card-home church-action-card" href="#${href}">
      <span class="action-card-icon">${iconHtml(icon, { weight: "bold", size: "md" })}</span>
      <span class="action-card-label">${escapeHtml(label)}</span>
    </a>
  `;
}

/**
 * Church History row — sign and color follow transaction_type, not the amount sign.
 * @param {{ id: string, transaction_type?: string, amount_fcfa?: number, reason?: string, note?: string, transaction_date?: string, church_funds?: { name?: string } }} tx
 */
export function churchHistoryRowHtml(tx) {
  const isExpense = tx.transaction_type === "expense";
  return `
    <a
      class="list-row church-history-row"
      href="#${churchOperationPath(tx.id)}"
    >
      <span class="list-row-icon ${isExpense ? "is-out" : "is-in"}">
        ${iconHtml(isExpense ? "arrow-up" : "arrow-down", { weight: "bold" })}
      </span>
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(tx.reason)}</span>
        <span class="list-row-meta">${typeBadgeHtml(tx.transaction_type)} · ${escapeHtml(fundName(tx.church_funds))} · ${escapeHtml(formatNumericDateFr(tx.transaction_date))}${noteIndicatorHtml(tx.note) ? " · Note" : ""}</span>
      </span>
      <span class="list-row-amount ${isExpense ? "amount-negative" : "amount-positive"}">
        ${amountHtml(tx.amount_fcfa, {
          className: "amount-sm",
          signed: true,
          tone: isExpense ? "out" : "in",
        })}
      </span>
    </a>
  `;
}

/**
 * Report period totals as aligned label/value rows.
 * @param {{ incomeTotal: number, expenseTotal: number, netMovement: number }} totals
 */
export function churchReportMetricsHtml(totals) {
  return `
    <div class="church-report-rows">
      <div class="church-report-row">
        <span>Entrées</span>
        <strong>${escapeHtml(formatFcfa(totals.incomeTotal))}</strong>
      </div>
      <div class="church-report-row">
        <span>Sorties</span>
        <strong>${escapeHtml(formatFcfa(totals.expenseTotal))}</strong>
      </div>
      <div class="church-report-row">
        <span>Variation</span>
        <strong class="${totals.netMovement < 0 ? "amount-negative" : ""}">${escapeHtml(formatFcfaSigned(totals.netMovement))}</strong>
      </div>
    </div>
  `;
}
