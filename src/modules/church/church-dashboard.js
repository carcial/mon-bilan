import { iconHtml } from "../../components/icons.js";
import { renderGroupedBarChart } from "../../components/charts.js";
import { getChurchBalances, getChurchTransactions } from "../../services/supabase/church.js";
import { isSupabaseConfigured } from "../../config.js";
import { greetingForNow } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { getWeekRangeInAppZone, monthTitleFr } from "../../utils/periods.js";
import {
  buildChurchWeekSeries,
  calculatePeriodTotals,
} from "../../utils/church-calc.js";
import {
  churchHomeHtml,
  emptyStateHtml,
  errorStateHtml,
  skeletonHtml,
} from "./church-ui.js";

export { churchHomeHtml };

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
    const week = getWeekRangeInAppZone();
    const [{ funds, total }, transactions] = await Promise.all([
      getChurchBalances(),
      getChurchTransactions({ from: week.from, to: week.to }),
    ]);
    const weekly = calculatePeriodTotals(transactions);
    const chart = buildChurchWeekSeries(transactions, week);
    body.innerHTML = churchHomeHtml({ funds, total, weekly });
    bindWeekChart(body, chart);
  } catch (err) {
    console.warn("[church] dashboard load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = `${skeletonHtml(2)}${skeletonHtml(2)}`;
      loadDashboard(body, ctx);
    });
  }
}

function bindWeekChart(body, chart) {
  const canvas = body.querySelector('[data-role="flow-chart"]');
  if (!canvas) return;
  renderGroupedBarChart(canvas, {
    labels: chart.labels,
    emptyMessage: "Aucune opération cette semaine",
    series: [
      { label: "Entrées", values: chart.incomeValues, color: "#25835A" },
      { label: "Sorties", values: chart.expenseValues, color: "#B83A3A" },
    ],
  });
}
