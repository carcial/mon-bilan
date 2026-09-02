import { amountHtml } from "../../components/amount.js";
import { navigate, ROUTES } from "../../router.js";
import { getChurchFunds, getChurchTransactions } from "../../services/supabase/church.js";
import { formatNumericDateFr } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { getPeriodRange, PERIODS } from "../../utils/periods.js";
import {
  CHURCH_LINKS,
  emptyStateHtml,
  errorStateHtml,
  fundName,
  fundSelectHtml,
  noteIndicatorHtml,
  pageHeaderHtml,
  skeletonHtml,
  typeBadgeHtml,
} from "./church-ui.js";
import { churchOperationPath } from "./church-routes.js";

/** @type {{ period: string, fundId: string, type: string, from: string, to: string }} */
let historyFilters = {
  period: PERIODS.month,
  fundId: "",
  type: "",
  from: "",
  to: "",
};

/**
 * @param {HTMLElement} root
 */
export function renderChurchHistory(root) {
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      ${pageHeaderHtml({
        kicker: "Église",
        title: "Historique",
        subtitle: "Entrées et sorties des caisses.",
        backHref: ROUTES.church,
      })}
      <div data-role="filters">${skeletonHtml(1)}</div>
      <div data-role="list">${skeletonHtml(3)}</div>
    </section>
  `;

  loadHistory(root);
}

async function loadHistory(root) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const listEl = root.querySelector('[data-role="list"]');
  if (!filtersEl || !listEl) return;

  try {
    const funds = await getChurchFunds();
    filtersEl.innerHTML = filtersHtml(funds);
    bindFilters(root, funds);
    await refreshList(listEl);
  } catch (err) {
    console.warn("[church] history load failed", err);
    filtersEl.innerHTML = "";
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      listEl.innerHTML = skeletonHtml(3);
      loadHistory(root);
    });
  }
}

function filtersHtml(funds) {
  const { period, fundId, type, from, to } = historyFilters;
  const periodButtons = [
    [PERIODS.today, "Aujourd'hui"],
    [PERIODS.week, "Cette semaine"],
    [PERIODS.month, "Ce mois"],
    [PERIODS.year, "Cette année"],
    [PERIODS.custom, "Période"],
  ];

  return `
    <div class="filter-panel stack-sm">
      <div class="filter-row" role="group" aria-label="Période">
        ${periodButtons
          .map(
            ([value, label]) => `
          <button
            type="button"
            class="filter-chip${period === value ? " is-active" : ""}"
            data-filter="period"
            data-value="${value}"
            aria-pressed="${period === value}"
          >${escapeHtml(label)}</button>
        `,
          )
          .join("")}
      </div>

      <div class="custom-period${period === PERIODS.custom ? "" : " is-hidden"}" data-role="custom-period">
        <div class="field">
          <label class="field-label" for="hist-from">Du</label>
          <input id="hist-from" class="field-input" type="date" value="${escapeHtml(from)}" data-role="from" />
        </div>
        <div class="field">
          <label class="field-label" for="hist-to">Au</label>
          <input id="hist-to" class="field-input" type="date" value="${escapeHtml(to)}" data-role="to" />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="hist-fund">Caisse</label>
        <select id="hist-fund" class="field-input" data-role="fund">
          ${fundSelectHtml(funds, fundId, { includeAll: true, allLabel: "Toutes les caisses" })}
        </select>
      </div>

      <div class="filter-row" role="group" aria-label="Type d'opération">
        ${[
          ["", "Toutes"],
          ["income", "Entrées"],
          ["expense", "Sorties"],
        ]
          .map(
            ([value, label]) => `
          <button
            type="button"
            class="filter-chip${type === value ? " is-active" : ""}"
            data-filter="type"
            data-value="${value}"
            aria-pressed="${type === value}"
          >${escapeHtml(label)}</button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function bindFilters(root, _funds) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const listEl = root.querySelector('[data-role="list"]');
  if (!filtersEl || !listEl) return;

  filtersEl.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter");
      const value = btn.getAttribute("data-value") ?? "";
      if (key === "period") historyFilters.period = value;
      if (key === "type") historyFilters.type = value;
      filtersEl.innerHTML = filtersHtml(_funds);
      bindFilters(root, _funds);
      refreshList(listEl);
    });
  });

  filtersEl.querySelector('[data-role="fund"]')?.addEventListener("change", (event) => {
    historyFilters.fundId = event.target.value;
    refreshList(listEl);
  });

  const fromEl = filtersEl.querySelector('[data-role="from"]');
  const toEl = filtersEl.querySelector('[data-role="to"]');
  fromEl?.addEventListener("change", () => {
    historyFilters.from = fromEl.value;
    refreshList(listEl);
  });
  toEl?.addEventListener("change", () => {
    historyFilters.to = toEl.value;
    refreshList(listEl);
  });
}

async function refreshList(listEl) {
  listEl.innerHTML = skeletonHtml(3);
  try {
    const range = getPeriodRange(historyFilters.period, {
      from: historyFilters.from,
      to: historyFilters.to,
    });
    const rows = await getChurchTransactions({
      from: range.from,
      to: range.to,
      fundId: historyFilters.fundId || null,
      type: historyFilters.type || null,
    });

    if (!rows.length) {
      listEl.innerHTML = emptyStateHtml({
        title: "Aucune opération pour le moment.",
        body: "Les entrées et sorties de cette période apparaîtront ici.",
        actionHref: CHURCH_LINKS.income,
        actionLabel: "Ajouter une entrée",
      });
      return;
    }

    listEl.innerHTML = `
      <div class="tx-list">
        ${rows.map(transactionCardHtml).join("")}
      </div>
    `;
    listEl.querySelectorAll("[data-id]").forEach((card) => {
      card.addEventListener("click", () => {
        navigate(churchOperationPath(card.getAttribute("data-id")));
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(churchOperationPath(card.getAttribute("data-id")));
        }
      });
    });
  } catch (err) {
    console.warn("[church] history list failed", err);
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      refreshList(listEl);
    });
  }
}

function transactionCardHtml(tx) {
  const isExpense = tx.transaction_type === "expense";
  return `
    <article
      class="card tx-card"
      data-id="${escapeHtml(tx.id)}"
      role="button"
      tabindex="0"
      aria-label="${isExpense ? "Sortie" : "Entrée"} ${tx.amount_fcfa} FCFA"
    >
      <div class="tx-card-top">
        ${typeBadgeHtml(tx.transaction_type)}
        ${noteIndicatorHtml(tx.note)}
      </div>
      <div class="${isExpense ? "amount-negative" : "amount-positive"}">
        ${amountHtml(tx.amount_fcfa, { className: "amount-sm" })}
      </div>
      <p class="tx-fund">${escapeHtml(fundName(tx.church_funds))}</p>
      <p class="tx-reason">${escapeHtml(tx.reason)}</p>
      <p class="tx-date">${escapeHtml(formatNumericDateFr(tx.transaction_date))}</p>
    </article>
  `;
}
