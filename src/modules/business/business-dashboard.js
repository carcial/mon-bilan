import { amountHtml } from "../../components/amount.js";
import { iconHtml } from "../../components/icons.js";
import { renderGroupedBarChart, weeklySeriesFromRows } from "../../components/charts.js";
import { isSupabaseConfigured } from "../../config.js";
import { getBusinessReport } from "../../services/supabase/business.js";
import { greetingForNow, todayIso } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { saleItemsTotal } from "../../utils/business-calc.js";
import { formatFcfa } from "../../utils/money.js";
import { getPeriodRange, monthTitleFr, PERIODS } from "../../utils/periods.js";
import {
  BUSINESS_LINKS,
  emptyStateHtml,
  errorStateHtml,
  skeletonHtml,
  stockWatchHtml,
} from "./business-ui.js";

/**
 * @param {HTMLElement} root
 * @param {{ embedded?: boolean }} [ctx]
 */
export function renderBusinessDashboard(root, ctx = {}) {
  const greeting = greetingForNow();
  const month = monthTitleFr();
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      <header class="page-header home-greeting">
        <p class="dash-date">${escapeHtml(greeting)} · ${escapeHtml(month)}</p>
        <h1 class="dash-title" id="business-title">Commerce</h1>
      </header>
      ${
        isSupabaseConfigured()
          ? `<div data-role="body">${skeletonHtml(4)}</div>`
          : `
        ${
          ctx.embedded
            ? ""
            : `<div class="config-banner" role="status">
                ${iconHtml("info", { weight: "fill", size: "md" })}
                <div>
                  <strong>Configuration requise</strong>
                  Connectez Supabase pour enregistrer ventes et arrivages.
                </div>
              </div>`
        }
        ${emptyStateHtml({ title: "Aucune donnée pour le moment." })}
      `
      }
    </section>
  `;
  if (!isSupabaseConfigured()) return;
  loadDashboard(root.querySelector('[data-role="body"]'));
}

async function loadDashboard(body) {
  if (!body) return;
  try {
    const today = todayIso();
    const month = getPeriodRange(PERIODS.month);
    const [todayReport, monthReport] = await Promise.all([
      getBusinessReport({ from: today, to: today }),
      getBusinessReport(month),
    ]);
    body.innerHTML = dashboardHtml({ todayReport, monthReport });
    bindCharts(body, monthReport);
  } catch (err) {
    console.warn("[business] dashboard failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(4);
      loadDashboard(body);
    });
  }
}

function dashboardHtml({ todayReport, monthReport }) {
  const owing = (monthReport.receivables || []).filter((row) => row.outstanding > 0).slice(0, 3);
  const payable = (monthReport.payables || []).filter((row) => row.outstanding > 0).slice(0, 3);

  return `
    <div class="dashboard-grid">
      <article class="hero-card">
        <p class="hero-kicker">Résultat du mois</p>
        <div>${amountHtml(monthReport.estimatedProfit, { signed: true })}</div>
        <div class="hero-metrics">
          <div class="hero-metric">
            <span>Ventes</span>
            <strong>${escapeHtml(formatFcfa(monthReport.revenue))}</strong>
          </div>
          <div class="hero-metric">
            <span>Dépenses</span>
            <strong>${escapeHtml(formatFcfa(monthReport.operatingExpenses))}</strong>
          </div>
          <div class="hero-metric">
            <span>Marge</span>
            <strong>${escapeHtml(formatFcfa(monthReport.grossMargin))}</strong>
          </div>
        </div>
      </article>

      <section class="section-block dashboard-span">
        <h2 class="section-title">Actions</h2>
        <div class="actions-grid-4">
          ${actionTile(BUSINESS_LINKS.sale, "receipt", "Nouvelle vente")}
          ${actionTile(BUSINESS_LINKS.arrival, "truck", "Nouvel arrivage")}
          ${actionTile(BUSINESS_LINKS.expenses, "wallet", "Dépense")}
          ${actionTile(BUSINESS_LINKS.receivables, "hand-coins", "Paiement")}
        </div>
      </section>

      <article class="list-card">
        <div class="section-head" style="padding:0.9rem 1rem 0">
          <h2 class="section-title">Aujourd'hui</h2>
        </div>
        <div class="today-metrics">
          ${todayRow("Ventes", todayReport.revenue)}
          ${todayRow("Cash reçu", todayReport.cashCollected)}
          ${todayRow("Crédit des ventes", todayReport.creditIssued)}
        </div>
      </article>

      <article class="list-card">
        <div class="section-head" style="padding:0.9rem 1rem 0">
          <h2 class="section-title">À surveiller</h2>
        </div>
        <div class="watch-list">
          ${watchRow(BUSINESS_LINKS.receivables, "users", "Clients qui doivent", monthReport.receivablesTotal, owing.length)}
          ${watchRow(BUSINESS_LINKS.payables, "truck", "Fournisseurs à payer", monthReport.payablesTotal, payable.length)}
          ${stockWatchHtml({
            href: BUSINESS_LINKS.stock,
            inventory: monthReport.inventory,
            stockUnits: monthReport.stockUnits,
          })}
        </div>
      </article>

      <article class="chart-card dashboard-span">
        <h2 class="section-title">Ventes et dépenses du mois</h2>
        <div class="chart-frame">
          <canvas data-role="month-chart" aria-label="Ventes et dépenses du mois"></canvas>
        </div>
      </article>
    </div>
  `;
}

function actionTile(href, icon, label) {
  return `
    <a class="action-card" href="#${href}">
      <span class="action-card-icon">${iconHtml(icon, { weight: "bold", size: "md" })}</span>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

function todayRow(label, amount) {
  return `
    <div class="today-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatFcfa(amount))}</strong>
    </div>
  `;
}

function watchRow(href, icon, label, amount, count) {
  return `
    <a class="list-row" href="#${href}">
      <span class="list-row-icon">${iconHtml(icon, { weight: "bold" })}</span>
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(label)}</span>
        <span class="list-row-meta">${count} dossier${count > 1 ? "s" : ""}</span>
      </span>
      <span class="list-row-amount">${escapeHtml(formatFcfa(amount))}</span>
    </a>
  `;
}

function saleAmount(sale) {
  return saleItemsTotal(sale);
}

function bindCharts(body, monthReport) {
  const sales = weeklySeriesFromRows(monthReport.sales, (row) => row.sale_date, saleAmount);
  const expenses = weeklySeriesFromRows(
    (monthReport.expenses || []).filter((row) => !row.is_arrival_cost_allocation),
    (row) => row.expense_date,
    (row) => row.amount_fcfa,
  );
  renderGroupedBarChart(body.querySelector('[data-role="month-chart"]'), {
    labels: sales.labels,
    series: [
      { label: "Ventes", values: sales.values, color: "#F28C28" },
      { label: "Dépenses", values: expenses.values, color: "#C56A12" },
    ],
  });
}
