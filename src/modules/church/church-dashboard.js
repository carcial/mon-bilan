import { amountHtml } from "../../components/amount.js";
import { iconHtml } from "../../components/icons.js";
import { renderDonutChart, renderGroupedBarChart, showChartEmpty, weeklySeriesFromRows } from "../../components/charts.js";
import { ROUTES } from "../../router.js";
import { getChurchBalances, getChurchReport } from "../../services/supabase/church.js";
import { isSupabaseConfigured } from "../../config.js";
import { greetingForNow } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { getPeriodRange, monthTitleFr, PERIODS } from "../../utils/periods.js";
import {
  CHURCH_LINKS,
  emptyStateHtml,
  errorStateHtml,
  fundName,
  skeletonHtml,
} from "./church-ui.js";

/**
 * @param {HTMLElement} root
 * @param {{ onChanged?: () => void, embedded?: boolean }} [ctx]
 */
export function renderChurchDashboard(root, ctx = {}) {
  const greeting = greetingForNow();
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      <header class="page-header home-greeting">
        <p class="dash-date">${escapeHtml(greeting)} · ${escapeHtml(monthTitleFr())}</p>
        <h1 class="dash-title" id="church-title">Église — Trésorerie</h1>
      </header>
      ${
        isSupabaseConfigured()
          ? `<div data-role="body">${skeletonHtml(2)}${skeletonHtml(2)}</div>`
          : `
        ${
          ctx.embedded
            ? ""
            : `<div class="config-banner" role="status">
                ${iconHtml("info", { weight: "fill", size: "md" })}
                <div>
                  <strong>Configuration requise</strong>
                  Connectez Supabase pour voir les soldes et enregistrer des opérations.
                </div>
              </div>`
        }
        ${emptyStateHtml({
          title: "Aucune donnée pour le moment.",
          body: "Les soldes apparaîtront une fois la base connectée.",
        })}
      `
      }
    </section>
  `;

  if (!isSupabaseConfigured()) return;
  loadDashboard(root.querySelector('[data-role="body"]'), ctx);
}

async function loadDashboard(body, ctx) {
  if (!body) return;
  try {
    const month = getPeriodRange(PERIODS.month);
    const [{ funds, total }, report] = await Promise.all([
      getChurchBalances(),
      getChurchReport(month),
    ]);
    body.innerHTML = dashboardHtml({ funds, total, report });
    bindCharts(body, { funds, report });
  } catch (err) {
    console.warn("[church] dashboard load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = `${skeletonHtml(2)}${skeletonHtml(2)}`;
      loadDashboard(body, ctx);
    });
  }
}

function dashboardHtml({ funds, total, report }) {
  const ordinary = pickFund(funds, /ordinaire|principale/i);
  const works = pickFund(funds, /travaux|œuvre|oeuvre/i);
  const shown = [ordinary, works].filter(Boolean);
  const fundLine =
    shown.length >= 2
      ? shown
      : funds.slice(0, 2);

  return `
    <div class="dashboard-grid">
      <article class="hero-card">
        <p class="hero-kicker">Solde actuel</p>
        <div>${amountHtml(total)}</div>
        <div class="hero-funds">
          ${fundLine
            .map(
              (fund) => `
            <div class="hero-fund">
              <span>${escapeHtml(caisseLabel(fund))}</span>
              <strong>${escapeHtml(formatFcfa(fund.balance))}</strong>
            </div>
          `,
            )
            .join("")}
        </div>
      </article>

      <section class="section-block">
        <h2 class="section-title">Actions</h2>
        <div class="actions-grid">
          ${actionTile(CHURCH_LINKS.income, "arrow-down", "Ajouter une entrée")}
          ${actionTile(CHURCH_LINKS.expense, "arrow-up", "Ajouter une sortie")}
        </div>
        <div class="secondary-actions">
          <a class="btn btn-ghost" href="#${CHURCH_LINKS.reconciliation}">
            ${iconHtml("check-circle", { weight: "bold", size: "sm" })} Vérifier la caisse
          </a>
          <a class="btn btn-ghost" href="#${ROUTES.history}">
            ${iconHtml("clock-counter-clockwise", { weight: "bold", size: "sm" })} Historique
          </a>
          <a class="btn btn-ghost" href="#${ROUTES.moreReport}">
            ${iconHtml("chart-bar", { weight: "bold", size: "sm" })} Rapports
          </a>
        </div>
      </section>

      <article class="chart-card">
        <h2 class="section-title">Mouvement du mois</h2>
        <div class="chart-frame">
          <canvas data-role="flow-chart" aria-label="Entrées et sorties du mois"></canvas>
        </div>
      </article>

      <article class="chart-card">
        <h2 class="section-title">Répartition des caisses</h2>
        <div class="chart-frame">
          <canvas data-role="fund-chart" aria-label="Répartition des caisses"></canvas>
        </div>
      </article>
    </div>
  `;
}

function pickFund(funds, pattern) {
  return funds.find((fund) => pattern.test(fundName(fund)));
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

function bindCharts(body, { funds, report }) {
  const txs = report?.transactions || [];
  const income = weeklySeriesFromRows(
    txs.filter((row) => row.transaction_type === "income"),
    (row) => row.transaction_date,
    (row) => row.amount_fcfa,
  );
  const expense = weeklySeriesFromRows(
    txs.filter((row) => row.transaction_type === "expense"),
    (row) => row.transaction_date,
    (row) => row.amount_fcfa,
  );
  renderGroupedBarChart(body.querySelector('[data-role="flow-chart"]'), {
    labels: income.labels,
    series: [
      { label: "Entrées", values: income.values, color: "#25835A" },
      { label: "Sorties", values: expense.values, color: "#B83A3A" },
    ],
  });

  const slices = (funds || []).filter((fund) => (fund.balance || 0) > 0);
  if (!slices.length) {
    showChartEmpty(body.querySelector('[data-role="fund-chart"]'), "Aucun solde à répartir.");
    return;
  }
  renderDonutChart(body.querySelector('[data-role="fund-chart"]'), {
    labels: slices.map((fund) => caisseLabel(fund)),
    values: slices.map((fund) => fund.balance || 0),
    colors: ["#5E63D8", "#8B7CF6", "#4B6FA8", "#25835A"],
  });
}
