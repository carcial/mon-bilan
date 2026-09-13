/**
 * Shared Church UI helpers.
 */

import { amountHtml } from "../../components/amount.js";
import { formatFcfa } from "../../utils/money.js";
import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";
import { iconHtml } from "../../components/icons.js";
import { pageHeaderHtml as sharedPageHeaderHtml, backLinkHtml } from "../../components/page-header.js";

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
 *   funds: Array<{ id?: string, name?: string, balance?: number }>,
 *   total: number,
 *   weekly: { incomeTotal: number, expenseTotal: number, netMovement: number },
 * }} model
 */
export function churchHomeHtml({ funds, total, weekly }) {
  const ordinary = pickFund(funds, /ordinaire|principale/i);
  const works = pickFund(funds, /travaux|œuvre|oeuvre/i);
  const shown = [ordinary, works].filter(Boolean);
  const fundLine = shown.length >= 2 ? shown : (funds || []).slice(0, 2);

  return `
    <div class="dashboard-grid church-home">
      <article class="hero-card church-week-hero">
        <p class="hero-kicker">Cette semaine</p>
        <div class="church-week-metrics">
          <a class="church-week-metric" href="#${CHURCH_LINKS.weekIncome}">
            <span>Entrées</span>
            <strong>${escapeHtml(formatFcfa(weekly.incomeTotal))}</strong>
          </a>
          <a class="church-week-metric" href="#${CHURCH_LINKS.weekExpense}">
            <span>Sorties</span>
            <strong>${escapeHtml(formatFcfa(weekly.expenseTotal))}</strong>
          </a>
          <div class="church-week-metric church-week-net">
            <span>Solde de la semaine</span>
            <strong>${escapeHtml(formatFcfa(weekly.netMovement))}</strong>
          </div>
        </div>
      </article>

      <article class="chart-card church-week-chart">
        <h2 class="section-title">Mouvement de la semaine</h2>
        <div class="chart-frame">
          <canvas data-role="flow-chart" aria-label="Entrées et sorties de la semaine"></canvas>
        </div>
      </article>

      <article class="card church-total-card">
        <p class="church-total-kicker">Solde total actuel</p>
        <div class="church-total-amount">${amountHtml(total)}</div>
        <div class="church-fund-split">
          ${fundLine
            .map(
              (fund) => `
            <div class="church-fund-item">
              <span>${escapeHtml(caisseLabel(fund))}</span>
              <strong>${escapeHtml(formatFcfa(fund.balance))}</strong>
            </div>
          `,
            )
            .join("")}
        </div>
      </article>

      <section class="section-block church-home-actions">
        <h2 class="section-title">Actions</h2>
        <div class="actions-grid">
          ${actionTile(CHURCH_LINKS.income, "arrow-down", "Ajouter une entrée")}
          ${actionTile(CHURCH_LINKS.expense, "arrow-up", "Ajouter une sortie")}
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
    </div>
  `;
}

function pickFund(funds, pattern) {
  return (funds || []).find((fund) => pattern.test(fundName(fund)));
}

function actionTile(href, icon, label) {
  return `
    <a class="action-card" href="#${href}">
      <span class="action-card-icon">${iconHtml(icon, { weight: "bold", size: "md" })}</span>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

function caisseLabel(fund) {
  const name = fundName(fund);
  if (/^caisse\b/i.test(name)) return name;
  if (/ordinaire/i.test(name)) return "Ordinaire";
  if (/travaux|œuvre|oeuvre/i.test(name)) return "Travaux";
  return name;
}
