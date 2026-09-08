import { amountHtml } from "../../components/amount.js";
import { iconHtml } from "../../components/icons.js";
import { isSupabaseConfigured } from "../../config.js";
import { getBusinessReport, getSales } from "../../services/supabase/business.js";
import { greetingForNow, relativeDayLabel, todayIso } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import {
  saleItemsTotal,
  uniqueKnownCustomerCount,
} from "../../utils/business-calc.js";
import { businessSalePath } from "./business-routes.js";
import {
  BUSINESS_LINKS,
  emptyStateHtml,
  errorStateHtml,
  skeletonHtml,
  stockAvailableCompact,
  stockUnitTypeFromInventory,
} from "./business-ui.js";

/**
 * @param {HTMLElement} root
 * @param {{ embedded?: boolean }} [ctx]
 */
export function renderBusinessDashboard(root, ctx = {}) {
  const greeting = greetingForNow();
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      <header class="page-header home-greeting">
        <p class="dash-date">${escapeHtml(greeting)}</p>
        <h1 class="dash-title" id="business-title">Commerce</h1>
      </header>
      ${
        isSupabaseConfigured()
          ? `<div data-role="body">${skeletonHtml(3)}</div>`
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
    const [report, recentSales] = await Promise.all([
      getBusinessReport({ from: today, to: today }),
      getSales(),
    ]);
    body.innerHTML = commerceHomeHtml(report, { recentSales: recentSales.slice(0, 3) });
  } catch (err) {
    console.warn("[business] dashboard failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(3);
      loadDashboard(body);
    });
  }
}

/**
 * Commerce Home is a summary/navigation layer only.
 * Totals come from getBusinessReport (today) + current inventory snapshot.
 */
export function commerceHomeHtml(report = {}, options = {}) {
  const owing = (report.receivables || []).filter((row) => row.outstanding > 0);
  const payable = (report.payables || []).filter((row) => row.outstanding > 0);
  const sales = report.sales || [];
  const salesCount = sales.length;
  const salesWord = salesCount > 1 ? "ventes" : "vente";
  const customersToday = uniqueKnownCustomerCount(sales);
  const customersWord = customersToday > 1 ? "clients" : "client";
  const stockUnits = report.stockUnits;
  const stockPhrase = stockAvailableCompact(
    stockUnits,
    stockUnitTypeFromInventory(report.inventory),
  );
  const recentSales = (options.recentSales || sales).slice(0, 3);

  return `
    <div class="ops-home">
      <section class="ops-metric-grid" aria-label="Indicateurs du jour">
        ${metricCard({
          href: BUSINESS_LINKS.todaySales,
          label: "Ventes du jour",
          valueHtml: amountHtml(report.revenue || 0, { className: "amount-sm" }),
          meta: `${salesCount} ${salesWord}`,
        })}
        ${metricCard({
          href: BUSINESS_LINKS.stock,
          label: "Stock disponible",
          valueHtml: escapeHtml(stockPhrase),
          meta: "État actuel",
        })}
        ${metricCard({
          href: BUSINESS_LINKS.todayCustomers,
          label: "Clients servis aujourd'hui",
          valueHtml: escapeHtml(String(customersToday)),
          meta: `${customersToday} ${customersWord} identifié${customersToday > 1 ? "s" : ""}`,
        })}
      </section>

      <section class="section-block">
        <h2 class="section-title">Actions</h2>
        <div class="actions-grid">
          ${actionTile(BUSINESS_LINKS.sale, "receipt", "Nouvelle vente")}
          ${actionTile(BUSINESS_LINKS.arrival, "truck", "Nouvel arrivage")}
          ${actionTile(BUSINESS_LINKS.paymentNew, "hand-coins", "Paiement client")}
          ${actionTile(BUSINESS_LINKS.supplierPay, "credit-card", "Paiement fournisseur")}
        </div>
      </section>

      <section class="section-block">
        <h2 class="section-title">À surveiller</h2>
        <div class="list-card">
          ${watchRow(
            BUSINESS_LINKS.receivables,
            "users",
            "Clients qui doivent",
            formatFcfa(report.receivablesTotal || 0),
            `${owing.length} client${owing.length > 1 ? "s" : ""}`,
          )}
          ${watchRow(
            BUSINESS_LINKS.payables,
            "truck",
            "Fournisseurs à payer",
            formatFcfa(report.payablesTotal || 0),
            `${payable.length} fournisseur${payable.length > 1 ? "s" : ""}`,
          )}
        </div>
      </section>

      <section class="section-block">
        <div class="section-head">
          <h2 class="section-title">Ventes récentes</h2>
          <a class="section-link" href="#${BUSINESS_LINKS.allSales}">Voir tout</a>
        </div>
        <div class="list-card">
          ${
            recentSales.length
              ? recentSales.map((sale) => recentSaleRow(sale)).join("")
              : `<p class="empty-inline">Aucune vente récente.</p>`
          }
        </div>
      </section>
    </div>
  `;
}

function metricCard({ href, label, valueHtml, meta }) {
  return `
    <a class="card ops-metric-card" href="#${href}">
      <span class="ops-metric-label">${escapeHtml(label)}</span>
      <span class="ops-metric-value">${valueHtml}</span>
      <span class="ops-metric-meta">${escapeHtml(meta)}</span>
    </a>
  `;
}

function actionTile(href, icon, label) {
  return `
    <a class="action-card action-card-home" href="#${href}">
      <span class="action-card-icon">${iconHtml(icon, { weight: "bold", size: "md" })}</span>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

function watchRow(href, icon, label, value, meta) {
  return `
    <a class="list-row ops-watch-row" href="#${href}">
      <span class="list-row-icon">${iconHtml(icon, { weight: "bold" })}</span>
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(label)}</span>
        <span class="list-row-meta">${escapeHtml(meta)}</span>
      </span>
      <span class="list-row-amount ops-watch-value">${escapeHtml(value)}</span>
    </a>
  `;
}

function recentSaleRow(sale) {
  const qty = (sale.sale_items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );
  const name = sale.customers?.name || (sale.customer_id ? "Client" : "Vente");
  const qtyLabel = qty > 0 ? `${qty}` : "";
  return `
    <a class="list-row ops-recent-row" href="#${businessSalePath(sale.id)}">
      <span class="list-row-icon">${iconHtml("receipt", { weight: "bold" })}</span>
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(name)}</span>
        <span class="list-row-meta">${escapeHtml(
          [qtyLabel, relativeDayLabel(sale.sale_date || sale.created_at)].filter(Boolean).join(" · "),
        )}</span>
      </span>
      <span class="list-row-amount">${amountHtml(saleItemsTotal(sale), { className: "amount-sm" })}</span>
    </a>
  `;
}
