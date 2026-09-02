import { amountHtml } from "../../components/amount.js";
import { getGlobalReport } from "../../services/supabase/reports.js";
import { formatFcfa, formatFcfaSigned } from "../../utils/money.js";
import { formatLongDateFr } from "../../utils/dates.js";
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
  root.innerHTML = `
    <section class="page more-page" aria-labelledby="more-title">
      ${pageHeaderHtml({
        kicker: "Vue d’ensemble",
        title: "Rapport",
        subtitle: "Église et Commerce sont présentés séparément. Ils ne sont jamais additionnés.",
        backHref: "/plus",
        titleId: "more-title",
      })}
      <div data-role="filters">${periodFiltersHtml()}</div>
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;
  bindPeriodFilters(root);
  loadReport(root.querySelector('[data-role="body"]'));
}

function periodFiltersHtml() {
  const buttons = [
    [PERIODS.week, "Semaine"],
    [PERIODS.month, "Mois"],
    [PERIODS.year, "Année"],
    [PERIODS.custom, "Période"],
  ];

  return `
    <div class="filter-panel stack-sm">
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
        <div class="field">
          <label class="field-label" for="global-report-from">Du</label>
          <input id="global-report-from" class="field-input" type="date" value="${escapeHtml(reportFrom)}" data-role="from" />
        </div>
        <div class="field">
          <label class="field-label" for="global-report-to">Au</label>
          <input id="global-report-to" class="field-input" type="date" value="${escapeHtml(reportTo)}" data-role="to" />
        </div>
      </div>
    </div>
  `;
}

function bindPeriodFilters(root) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const body = root.querySelector('[data-role="body"]');
  if (!filtersEl || !body) return;

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
    const report = await getGlobalReport(range);
    body.innerHTML = reportHtml(report, range);
  } catch (err) {
    console.warn("[reports] load failed", err);
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
        ? `${formatLongDateFr(range.from)} → ${formatLongDateFr(range.to)}`
        : periodLabelFr(reportPeriod);

  const { church, business } = report;
  const lastRecon =
    church.lastReconciliationDifference == null
      ? "Aucun rapprochement"
      : formatFcfaSigned(church.lastReconciliationDifference);

  return `
    <p class="report-period">${escapeHtml(title)}</p>

    <article class="card card-accent-church">
      <p class="origin-badge origin-church"><span aria-hidden="true">⛪</span> ÉGLISE</p>
      <h2 class="section-title" style="margin-top:var(--space-4)">Église</h2>
      <p class="home-metric-label">Entrées</p>
      <div class="amount-positive">${amountHtml(church.incomeTotal, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Sorties</p>
      <div class="amount-negative">${amountHtml(church.expenseTotal, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Variation</p>
      <div>${amountHtml(church.variation, { className: "amount-sm", signed: true })}</div>
      <p class="home-metric-label">Solde</p>
      <div>${amountHtml(church.endingBalance, { className: "amount-sm" })}</div>
      <p class="field-hint">Dernier écart de caisse : ${escapeHtml(lastRecon)}</p>
    </article>

    <article class="card card-accent-business">
      <p class="origin-badge origin-business"><span aria-hidden="true">🛒</span> COMMERCE</p>
      <h2 class="section-title" style="margin-top:var(--space-4)">Commerce</h2>
      <p class="home-metric-label">Chiffre d’affaires</p>
      <div>${amountHtml(business.revenue, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Coût des marchandises vendues</p>
      <div>${amountHtml(business.cogs, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Dépenses</p>
      <div class="amount-negative">${amountHtml(business.operatingExpenses, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Bénéfice estimé</p>
      <div>${amountHtml(business.estimatedProfit, { className: "amount-sm", signed: true })}</div>
      <p class="home-metric-label">À recevoir</p>
      <div class="metric-plain">${escapeHtml(formatFcfa(business.receivablesTotal))}</div>
      <p class="field-hint">État actuel, pas seulement cette période.</p>
      <p class="home-metric-label">À payer</p>
      <div class="metric-plain">${escapeHtml(formatFcfa(business.payablesTotal))}</div>
      <p class="field-hint">État actuel, pas seulement cette période.</p>
      <p class="home-metric-label">Stock</p>
      <div class="metric-plain">${escapeHtml(String(business.stockUnits))} unités</div>
      <p class="field-hint">État actuel du stock disponible.</p>
    </article>

    <p class="field-hint report-separation">
      Ces deux univers ne doivent jamais être additionnés.
    </p>

    <a class="btn btn-primary btn-block" href="#${MORE_PATHS.export}">Exporter Excel</a>
  `;
}

export function getReportPeriodState() {
  return { reportPeriod, reportFrom, reportTo };
}
