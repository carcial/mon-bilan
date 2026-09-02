import { amountHtml } from "../../components/amount.js";
import { ROUTES } from "../../router.js";
import { getChurchReport } from "../../services/supabase/church.js";
import { formatFcfa, formatFcfaSigned } from "../../utils/money.js";
import { formatLongDateFr } from "../../utils/dates.js";
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
          <label class="field-label" for="report-from">Du</label>
          <input id="report-from" class="field-input" type="date" value="${escapeHtml(reportFrom)}" data-role="from" />
        </div>
        <div class="field">
          <label class="field-label" for="report-to">Au</label>
          <input id="report-to" class="field-input" type="date" value="${escapeHtml(reportTo)}" data-role="to" />
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
    const report = await getChurchReport(range);
    body.innerHTML = reportHtml(report, range);
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
        ? `${formatLongDateFr(range.from)} → ${formatLongDateFr(range.to)}`
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

    <article class="card card-accent-church">
      <p class="home-metric-label">Entrées</p>
      <div class="amount-positive">${amountHtml(totals.incomeTotal, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Sorties</p>
      <div class="amount-negative">${amountHtml(totals.expenseTotal, { className: "amount-sm" })}</div>
      <p class="home-metric-label">Variation</p>
      <div>${amountHtml(totals.netMovement, { className: "amount-sm", signed: true })}</div>
      <p class="field-hint">${escapeHtml(formatFcfaSigned(totals.netMovement))}</p>
    </article>

    <article class="card">
      <p class="home-metric-label">Solde de fin</p>
      <div>${amountHtml(endingTotal)}</div>
      ${
        range.to
          ? `<p class="field-hint">Au ${escapeHtml(formatLongDateFr(range.to))}</p>`
          : ""
      }
    </article>

    <div class="fund-grid">
      ${fundBlocks}
    </div>
  `;
}
