import { amountHtml } from "../../components/amount.js";
import { renderDonutChart, renderGroupedBarChart } from "../../components/charts.js";
import { ROUTES } from "../../router.js";
import { getChurchReport } from "../../services/supabase/church.js";
import { formatFcfa, formatFcfaSigned } from "../../utils/money.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { displayDateFr } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import {
  getPeriodRange,
  monthTitleFr,
  periodLabelFr,
  PERIODS,
} from "../../utils/periods.js";
import {
  CHURCH_LINKS,
  emptyStateHtml,
  errorStateHtml,
  fundName,
  pageHeaderHtml,
  skeletonHtml,
} from "./church-ui.js";

let reportPeriod = PERIODS.month;
let reportFrom = "";
let reportTo = "";

/**
 * @param {HTMLElement} root
 */
export function renderChurchReport(root) {
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      ${pageHeaderHtml({
        kicker: "Église",
        title: "Rapport",
        subtitle: "Entrées, sorties et soldes par période.",
        backHref: ROUTES.church,
      })}
      <div data-role="filters">${periodFiltersHtml()}</div>
      <div class="report-stack" data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;

  bindPeriodFilters(root);
  loadReport(root.querySelector('[data-role="body"]'));
}

function periodFiltersHtml() {
  const buttons = [
    [PERIODS.week, "Cette semaine"],
    [PERIODS.month, "Ce mois"],
    [PERIODS.year, "Cette année"],
    [PERIODS.custom, "Personnalisée"],
  ];

  return `
    <div class="filter-panel stack-sm">
      <p class="filter-legend">Période</p>
      <div class="filter-row" role="group" aria-label="Période du rapport">
        ${buttons
          .map(
            ([value, label]) => `
          <button
            type="button"
            class="filter-chip${reportPeriod === value ? " is-active" : ""}"
            data-period="${value}"
            aria-pressed="${reportPeriod === value}"
          >${escapeHtml(label)}</button>
        `,
          )
          .join("")}
      </div>
      <div class="custom-period${reportPeriod === PERIODS.custom ? "" : " is-hidden"}" data-role="custom-period">
        ${dateFieldHtml({ id: "report-from", name: "from", label: "Date de début", value: reportFrom, dataRole: "from", defaultToday: false })}
        ${dateFieldHtml({ id: "report-to", name: "to", label: "Date de fin", value: reportTo, dataRole: "to", defaultToday: false })}
      </div>
    </div>
  `;
}

function bindPeriodFilters(root) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const body = root.querySelector('[data-role="body"]');
  if (!filtersEl || !body) return;
  bindDateFields(filtersEl);

  filtersEl.querySelectorAll("[data-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      reportPeriod = btn.getAttribute("data-period") || PERIODS.month;
      filtersEl.innerHTML = periodFiltersHtml();
      bindPeriodFilters(root);
      loadReport(body);
    });
  });

  const fromEl = filtersEl.querySelector('[data-role="from"]');
  const toEl = filtersEl.querySelector('[data-role="to"]');
  fromEl?.addEventListener("change", () => {
    reportFrom = fromEl.value;
    loadReport(body);
  });
  toEl?.addEventListener("change", () => {
    reportTo = toEl.value;
    loadReport(body);
  });
}

async function loadReport(body) {
  if (!body) return;
  body.innerHTML = skeletonHtml(4);

  const range = getPeriodRange(reportPeriod, {
    from: reportFrom,
    to: reportTo,
  });

  if (reportPeriod === PERIODS.custom && (!range.from || !range.to)) {
    body.innerHTML = emptyStateHtml({
      title: "Choisissez une période.",
      body: "Indiquez une date de début et une date de fin.",
    });
    return;
  }

  try {
    const report = await getChurchReport(range);
    body.innerHTML = reportHtml(report, range);
    bindReportCharts(body, report);
  } catch (err) {
    console.warn("[church] report load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      loadReport(body);
    });
  }
}

function reportHtml(report, range) {
  const title =
    reportPeriod === PERIODS.month
      ? monthTitleFr()
      : reportPeriod === PERIODS.custom && range.from && range.to
        ? `${displayDateFr(range.from)} → ${displayDateFr(range.to)}`
        : periodLabelFr(reportPeriod);

  const { totals, byFund, endingTotal } = report;
  const hasMovement = report.transactions.length > 0;

  const fundBlocks = byFund
    .map((row) => {
      const label = /^caisse\b/i.test(fundName(row.fund))
        ? fundName(row.fund)
        : `Caisse ${fundName(row.fund).toLowerCase()}`;
      return `
        <article class="card fund-card">
          <p class="home-metric-label">${escapeHtml(label)}</p>
          <div>${amountHtml(row.endingBalance, { className: "amount-sm" })}</div>
          <p class="field-hint">
            Entrées ${escapeHtml(formatFcfa(row.incomeTotal))}
            · Sorties ${escapeHtml(formatFcfa(row.expenseTotal))}
          </p>
        </article>
      `;
    })
    .join("");

  return `
    <p class="report-period">${escapeHtml(title)}</p>

    ${
      hasMovement
        ? ""
        : emptyStateHtml({
            title: "Aucune opération sur cette période.",
            body: "Les totaux ci-dessous restent à zéro. Le solde de fin tient compte des opérations antérieures.",
            actionHref: CHURCH_LINKS.income,
            actionLabel: "Ajouter une entrée",
          })
    }

    <article class="hero-card">
      <p class="hero-kicker">Solde de fin</p>
      <div>${amountHtml(endingTotal)}</div>
      <div class="hero-metrics">
        <div class="hero-metric"><span>Entrées</span><strong>${escapeHtml(formatFcfa(totals.incomeTotal))}</strong></div>
        <div class="hero-metric"><span>Sorties</span><strong>${escapeHtml(formatFcfa(totals.expenseTotal))}</strong></div>
        <div class="hero-metric"><span>Variation</span><strong>${escapeHtml(formatFcfaSigned(totals.netMovement))}</strong></div>
      </div>
      ${range.to ? `<p class="field-hint" style="color:rgba(255,255,255,0.78);margin-top:1rem">Au ${escapeHtml(displayDateFr(range.to))}</p>` : ""}
    </article>

    <article class="chart-card">
      <h2 class="section-title">Entrées et sorties</h2>
      <div class="chart-frame">
        <canvas data-role="church-flow" aria-label="Entrées et sorties"></canvas>
      </div>
    </article>

    <article class="chart-card">
      <h2 class="section-title">Caisses</h2>
      <div class="chart-frame">
        <canvas data-role="church-funds" aria-label="Soldes par caisse"></canvas>
      </div>
    </article>

    <div class="fund-grid">
      ${fundBlocks}
    </div>
  `;
}

function bindReportCharts(body, report) {
  renderGroupedBarChart(body.querySelector('[data-role="church-flow"]'), {
    labels: ["Période"],
    series: [
      { label: "Entrées", values: [report.totals.incomeTotal || 0], color: "#25835A" },
      { label: "Sorties", values: [report.totals.expenseTotal || 0], color: "#B83A3A" },
    ],
  });
  const funds = report.byFund || [];
  if (!funds.length) return;
  renderDonutChart(body.querySelector('[data-role="church-funds"]'), {
    labels: funds.map((row) => fundName(row.fund)),
    values: funds.map((row) => row.endingBalance || 0),
    colors: ["#5E63D8", "#8B7CF6", "#4B6FA8", "#25835A"],
  });
}
