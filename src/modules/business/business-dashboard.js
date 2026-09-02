import { amountHtml } from "../../components/amount.js";
import { isSupabaseConfigured } from "../../config.js";
import { getBusinessReport } from "../../services/supabase/business.js";
import { todayIso } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import {
  BUSINESS_LINKS,
  emptyStateHtml,
  errorStateHtml,
  skeletonHtml,
  unitLabel,
} from "./business-ui.js";

export function renderBusinessDashboard(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      <header class="page-header">
        <p class="page-kicker">Activité</p>
        <h1 class="page-title" id="business-title">Commerce</h1>
      </header>
      ${
        isSupabaseConfigured()
          ? `<div data-role="body">${skeletonHtml(4)}</div>`
          : `
        <div class="config-banner" role="status">
          <span aria-hidden="true">ℹ</span>
          <div>
            <strong>Configuration requise</strong>
            Connectez Supabase pour enregistrer ventes et arrivages.
          </div>
        </div>
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
    const report = await getBusinessReport({ from: today, to: today });
    body.innerHTML = dashboardHtml(report);
  } catch (err) {
    console.warn("[business] dashboard failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(4);
      loadDashboard(body);
    });
  }
}

function dashboardHtml(report) {
  const stockHint = report.inventory
    .map((row) => `${row.quantity_available} ${unitLabel(row.unit_type, row.quantity_available)} ${row.product_name}`)
    .join(" · ");

  return `
    <p class="report-period">AUJOURD'HUI</p>
    <article class="card card-accent-business">
      ${metricRow("Ventes", report.revenue)}
      ${metricRow("Cash reçu", report.cashCollected)}
      ${metricRow("Crédit accordé", report.creditIssued)}
      ${metricRow("Dépenses", report.operatingExpenses)}
      <p class="home-metric-label">Marge estimée</p>
      <div>${amountHtml(report.estimatedProfit, { className: "amount-sm", signed: true })}</div>
      <p class="home-metric-label">Sacs vendus</p>
      <p class="metric-plain">${escapeHtml(String(report.unitsSold))}</p>
    </article>

    <div class="fund-grid">
      <article class="card">
        <p class="home-metric-label">À recevoir des clients</p>
        <div>${amountHtml(report.receivablesTotal, { className: "amount-sm" })}</div>
        <a class="back-link" href="#${BUSINESS_LINKS.receivables}">Voir les clients</a>
      </article>
      <article class="card">
        <p class="home-metric-label">À payer aux fournisseurs</p>
        <div>${amountHtml(report.payablesTotal, { className: "amount-sm" })}</div>
        <a class="back-link" href="#${BUSINESS_LINKS.payables}">Voir les fournisseurs</a>
      </article>
    </div>

    <article class="card">
      <p class="home-metric-label">Stock restant</p>
      <p class="metric-plain">${escapeHtml(String(report.stockUnits))} ${report.stockUnits > 1 ? "unités" : "unité"}</p>
      ${stockHint ? `<p class="field-hint">${escapeHtml(stockHint)}</p>` : ""}
    </article>

    <div class="stack business-actions">
      <a class="btn btn-primary btn-block" href="#${BUSINESS_LINKS.sale}">+ Nouvelle vente</a>
      <a class="btn btn-secondary btn-block" href="#${BUSINESS_LINKS.arrival}">+ Nouvel arrivage</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.customers}">Clients</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.suppliers}">Fournisseurs</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.stock}">Stock</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.expenses}">Dépenses</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.bordereaux}">Bordereaux</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.history}">Historique</a>
      <a class="btn btn-ghost btn-block" href="#${BUSINESS_LINKS.report}">Rapport</a>
    </div>
  `;
}

function metricRow(label, amount) {
  return `
    <p class="home-metric-label">${escapeHtml(label)}</p>
    <div>${amountHtml(amount, { className: "amount-sm" })}</div>
  `;
}
