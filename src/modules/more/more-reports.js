import { amountHtml } from "../../components/amount.js";
import { iconHtml } from "../../components/icons.js";
import { renderGroupedBarChart } from "../../components/charts.js";
import { getDomainReport } from "../../services/supabase/reports.js";
import { getActiveDomain } from "../../state/app-mode.js";
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
import { MORE_PATHS } from "./more-routes.js";
import { emptyStateHtml, errorStateHtml, pageHeaderHtml, skeletonHtml } from "./more-ui.js";

let reportPeriod = PERIODS.month;
let reportFrom = "";
let reportTo = "";

export function renderGlobalReport(root) {
  const domain = getActiveDomain();
  root.innerHTML = `
    <section class="page more-page" aria-labelledby="more-title">
      ${pageHeaderHtml({
        kicker: "Plus",
        title: "Rapport",
        subtitle:
          domain === "church"
            ? "Entrées, sorties et solde de la trésorerie."
            : "Ventes, marge, dépenses et stock du commerce.",
        backHref: "/plus",
        titleId: "more-title",
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
        ${dateFieldHtml({ id: "global-report-from", name: "from", label: "Date de début", value: reportFrom, dataRole: "from", defaultToday: false })}
        ${dateFieldHtml({ id: "global-report-to", name: "to", label: "Date de fin", value: reportTo, dataRole: "to", defaultToday: false })}
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
    const domain = getActiveDomain();
    const report = await getDomainReport(range, domain);
    body.innerHTML = reportHtml(report, range, domain);
    bindReportCharts(body, report, domain);
  } catch (err) {
    console.warn("[reports] load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      loadReport(body);
    });
  }
}

function reportHtml(report, range, domain) {
  const title =
    reportPeriod === PERIODS.month
      ? monthTitleFr()
      : reportPeriod === PERIODS.custom && range.from && range.to
        ? `${displayDateFr(range.from)} → ${displayDateFr(range.to)}`
        : periodLabelFr(reportPeriod);

  if (domain === "church") {
    const { church } = report;
    const lastRecon =
      church.lastReconciliationDifference == null
        ? "Aucune vérification"
        : formatFcfaSigned(church.lastReconciliationDifference);
    return `
      <p class="report-period">${escapeHtml(title)}</p>
      <article class="hero-card">
        <p class="hero-kicker">Solde</p>
        <div>${amountHtml(church.endingBalance)}</div>
        <div class="hero-metrics">
          <div class="hero-metric"><span>Entrées</span><strong>${escapeHtml(formatFcfa(church.incomeTotal))}</strong></div>
          <div class="hero-metric"><span>Sorties</span><strong>${escapeHtml(formatFcfa(church.expenseTotal))}</strong></div>
          <div class="hero-metric"><span>Variation</span><strong>${escapeHtml(formatFcfaSigned(church.variation))}</strong></div>
        </div>
        <p class="field-hint" style="color:rgba(255,255,255,0.78);margin-top:1rem">Dernier écart de caisse : ${escapeHtml(lastRecon)}</p>
      </article>
      ${churchFundCardsHtml(report.churchFunds)}
      <article class="chart-card">
        <h2 class="section-title">Mouvements</h2>
        <div class="chart-frame">
          <canvas data-role="domain-chart" aria-label="Entrées et sorties de la période"></canvas>
        </div>
      </article>
      <a class="btn btn-primary btn-block" href="#${MORE_PATHS.export}">
        ${iconHtml("microsoft-excel-logo", { weight: "bold" })} Exporter Excel
      </a>
    `;
  }

  const { business } = report;
  return `
    <p class="report-period">${escapeHtml(title)}</p>
    <article class="hero-card">
      <p class="hero-kicker">Bénéfice estimé</p>
      <div>${amountHtml(business.estimatedProfit, { signed: true })}</div>
      <div class="hero-metrics">
        <div class="hero-metric"><span>Chiffre d’affaires</span><strong>${escapeHtml(formatFcfa(business.revenue))}</strong></div>
        <div class="hero-metric"><span>Montant fournisseur vendu</span><strong>${escapeHtml(formatFcfa(business.cogs))}</strong></div>
        <div class="hero-metric"><span>Dépenses</span><strong>${escapeHtml(formatFcfa(business.operatingExpenses))}</strong></div>
      </div>
    </article>
    <article class="list-card">
      <div class="today-metrics">
        <div class="today-metric"><span>À recevoir</span><strong>${escapeHtml(formatFcfa(business.receivablesTotal))}</strong></div>
        <div class="today-metric"><span>À payer</span><strong>${escapeHtml(formatFcfa(business.payablesTotal))}</strong></div>
        <div class="today-metric"><span>Stock</span><strong data-role="stock-total">${escapeHtml(String(business.stockUnits))} unités</strong></div>
      </div>
      <p class="field-hint report-snapshot-hint">À recevoir, à payer et stock sont l’état actuel.</p>
    </article>
    <article class="chart-card">
      <h2 class="section-title">Ventes et dépenses</h2>
      <div class="chart-frame">
        <canvas data-role="domain-chart" aria-label="Ventes et dépenses de la période"></canvas>
      </div>
    </article>
    <a class="btn btn-primary btn-block" href="#${MORE_PATHS.export}">
      ${iconHtml("microsoft-excel-logo", { weight: "bold" })} Exporter Excel
    </a>
  `;
}

function churchFundCardsHtml(funds = []) {
  if (!funds.length) return "";
  return `
    <div class="fund-grid">
      ${funds
        .map((row) => {
          const name = row.fund?.name || "Caisse";
          return `
            <article class="card fund-card">
              <p class="home-metric-label">${escapeHtml(name)}</p>
              <div>${amountHtml(row.endingBalance, { className: "amount-sm" })}</div>
              <p class="field-hint">
                Entrées ${escapeHtml(formatFcfa(row.incomeTotal))}
                · Sorties ${escapeHtml(formatFcfa(row.expenseTotal))}
              </p>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function bindReportCharts(body, report, domain) {
  if (domain === "church") {
    renderGroupedBarChart(body.querySelector('[data-role="domain-chart"]'), {
      labels: ["Période"],
      series: [
        { label: "Entrées", values: [report.church.incomeTotal || 0], color: "#25835A" },
        { label: "Sorties", values: [report.church.expenseTotal || 0], color: "#B83A3A" },
      ],
    });
    return;
  }
  renderGroupedBarChart(body.querySelector('[data-role="domain-chart"]'), {
    labels: ["Période"],
    series: [
      { label: "Ventes", values: [report.business.revenue || 0], color: "#25835A" },
      { label: "Dépenses", values: [report.business.operatingExpenses || 0], color: "#B83A3A" },
    ],
  });
}

export function getReportPeriodState() {
  return { reportPeriod, reportFrom, reportTo };
}
