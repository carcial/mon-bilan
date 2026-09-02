import { amountHtml } from "../../components/amount.js";
import { navigate } from "../../router.js";
import { getGlobalHistory, getHistoryFilterOptions, HISTORY_PAGE_SIZE } from "../../services/supabase/history.js";
import { formatNumericDateFr } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { getPeriodRange, PERIODS } from "../../utils/periods.js";
import { HISTORY_TYPE_LABELS } from "../../utils/history-events.js";
import {
  domainBadgeHtml,
  emptyStateHtml,
  errorStateHtml,
  pageHeaderHtml,
  selectOptionsHtml,
  skeletonHtml,
  typeBadgeHtml,
} from "./history-ui.js";

/** @type {{
 *   period: string,
 *   domain: string,
 *   type: string,
 *   fundId: string,
 *   supplierId: string,
 *   customerId: string,
 *   search: string,
 *   from: string,
 *   to: string,
 * }} */
let historyFilters = {
  period: PERIODS.month,
  domain: "",
  type: "",
  fundId: "",
  supplierId: "",
  customerId: "",
  search: "",
  from: "",
  to: "",
};

let visibleCount = HISTORY_PAGE_SIZE;
/** @type {object[]} */
let loadedEvents = [];
let loadedHasMore = false;

export function renderHistoryScreen(root) {
  visibleCount = HISTORY_PAGE_SIZE;
  loadedEvents = [];
  root.innerHTML = `
    <section class="page history-page" aria-labelledby="history-title">
      ${pageHeaderHtml({
        kicker: "Activité",
        title: "Historique",
        subtitle: "Église et Commerce restent séparés. Chaque carte indique l’origine.",
      })}
      <div data-role="filters">${skeletonHtml(1)}</div>
      <div data-role="list">${skeletonHtml(3)}</div>
    </section>
  `;
  loadHistory(root);
}

/** @deprecated Use renderHistoryScreen */
export function renderHistoryPlaceholder(root) {
  renderHistoryScreen(root);
}

async function loadHistory(root) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const listEl = root.querySelector('[data-role="list"]');
  if (!filtersEl || !listEl) return;

  try {
    const options = await getHistoryFilterOptions();
    filtersEl.innerHTML = filtersHtml(options);
    bindFilters(root, options);
    await refreshList(listEl);
  } catch (err) {
    console.warn("[history] load failed", err);
    filtersEl.innerHTML = "";
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      listEl.innerHTML = skeletonHtml(3);
      loadHistory(root);
    });
  }
}

function filtersHtml(options) {
  const { period, domain, type, fundId, supplierId, customerId, search, from, to } = historyFilters;
  const periodButtons = [
    [PERIODS.today, "Aujourd'hui"],
    [PERIODS.week, "Cette semaine"],
    [PERIODS.month, "Ce mois"],
    [PERIODS.year, "Cette année"],
    [PERIODS.custom, "Période"],
  ];
  const domainButtons = [
    ["", "Tout"],
    ["church", "Église"],
    ["business", "Commerce"],
  ];
  const typeOptions = [
    ["", "Toutes les opérations"],
    ...Object.entries(HISTORY_TYPE_LABELS),
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

      <div class="filter-row" role="group" aria-label="Origine">
        ${domainButtons
          .map(
            ([value, label]) => `
          <button
            type="button"
            class="filter-chip${domain === value ? " is-active" : ""}"
            data-filter="domain"
            data-value="${value}"
            aria-pressed="${domain === value}"
          >${escapeHtml(label)}</button>
        `,
          )
          .join("")}
      </div>

      <div class="field">
        <label class="field-label" for="hist-type">Type d’opération</label>
        <select id="hist-type" class="field-input" data-role="type">
          ${typeOptions
            .map(
              ([value, label]) =>
                `<option value="${escapeHtml(value)}"${type === value ? " selected" : ""}>${escapeHtml(label)}</option>`,
            )
            .join("")}
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="hist-search">Recherche</label>
        <input
          id="hist-search"
          class="field-input"
          type="search"
          placeholder="Motif, note, client, fournisseur, produit"
          value="${escapeHtml(search)}"
          data-role="search"
        />
      </div>

      <div class="history-extra-filters">
        <div class="field">
          <label class="field-label" for="hist-fund">Caisse Église</label>
          <select id="hist-fund" class="field-input" data-role="fund">
            ${selectOptionsHtml(options.funds || [], fundId, {
              includeAll: true,
              allLabel: "Toutes les caisses",
              labelFn: (fund) => fund.name,
            })}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="hist-supplier">Fournisseur</label>
          <select id="hist-supplier" class="field-input" data-role="supplier">
            ${selectOptionsHtml(options.suppliers || [], supplierId, {
              includeAll: true,
              allLabel: "Tous les fournisseurs",
              labelFn: (row) => row.name || row.code,
            })}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="hist-customer">Client</label>
          <select id="hist-customer" class="field-input" data-role="customer">
            ${selectOptionsHtml(options.customers || [], customerId, {
              includeAll: true,
              allLabel: "Tous les clients",
              labelFn: (row) => row.name,
            })}
          </select>
        </div>
      </div>
    </div>
  `;
}

function bindFilters(root, options) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const listEl = root.querySelector('[data-role="list"]');
  if (!filtersEl || !listEl) return;

  filtersEl.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter");
      const value = btn.getAttribute("data-value") ?? "";
      if (key === "period") historyFilters.period = value;
      if (key === "domain") historyFilters.domain = value;
      visibleCount = HISTORY_PAGE_SIZE;
      filtersEl.innerHTML = filtersHtml(options);
      bindFilters(root, options);
      refreshList(listEl);
    });
  });

  const bindChange = (role, field) => {
    filtersEl.querySelector(`[data-role="${role}"]`)?.addEventListener("change", (event) => {
      historyFilters[field] = event.target.value;
      visibleCount = HISTORY_PAGE_SIZE;
      refreshList(listEl);
    });
  };
  bindChange("type", "type");
  bindChange("fund", "fundId");
  bindChange("supplier", "supplierId");
  bindChange("customer", "customerId");
  bindChange("from", "from");
  bindChange("to", "to");

  let searchTimer = 0;
  filtersEl.querySelector('[data-role="search"]')?.addEventListener("input", (event) => {
    historyFilters.search = event.target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      visibleCount = HISTORY_PAGE_SIZE;
      refreshList(listEl);
    }, 250);
  });
}

async function refreshList(listEl) {
  listEl.innerHTML = skeletonHtml(3);
  try {
    const range = getPeriodRange(historyFilters.period, {
      from: historyFilters.from,
      to: historyFilters.to,
    });
    if (historyFilters.period === PERIODS.custom && (!range.from || !range.to)) {
      listEl.innerHTML = emptyStateHtml({
        title: "Choisissez une période.",
        body: "Indiquez une date de début et une date de fin.",
      });
      return;
    }

    const page = await getGlobalHistory({
      from: range.from,
      to: range.to,
      domain: historyFilters.domain,
      type: historyFilters.type,
      fundId: historyFilters.fundId,
      supplierId: historyFilters.supplierId,
      customerId: historyFilters.customerId,
      search: historyFilters.search,
      offset: 0,
      pageSize: visibleCount,
    });

    loadedEvents = page.items;
    loadedHasMore = page.hasMore;

    if (!page.total) {
      listEl.innerHTML = emptyStateHtml({
        title: "Aucune opération pour le moment.",
        body: "Les mouvements d’Église et de Commerce de cette période apparaîtront ici.",
      });
      return;
    }

    listEl.innerHTML = `
      <p class="history-count">${page.total} opération${page.total > 1 ? "s" : ""}</p>
      <div class="tx-list">
        ${page.items.map(eventCardHtml).join("")}
      </div>
      ${
        page.hasMore
          ? `<button type="button" class="btn btn-secondary btn-block history-more" data-action="more">Charger plus</button>`
          : ""
      }
    `;

    listEl.querySelectorAll("[data-href]").forEach((card) => {
      const href = card.getAttribute("data-href");
      const go = () => {
        if (href) navigate(href);
      };
      card.addEventListener("click", go);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go();
        }
      });
    });

    listEl.querySelector('[data-action="more"]')?.addEventListener("click", () => {
      visibleCount += HISTORY_PAGE_SIZE;
      refreshList(listEl);
    });
  } catch (err) {
    console.warn("[history] list failed", err);
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      refreshList(listEl);
    });
  }
}

function eventCardHtml(event) {
  const amount =
    event.amount == null
      ? ""
      : `<div class="${event.direction === "out" ? "amount-negative" : event.direction === "in" ? "amount-positive" : ""}">
          ${amountHtml(event.amount, { className: "amount-sm", signed: event.direction !== "neutral" })}
        </div>`;

  return `
    <article
      class="card tx-card history-card"
      data-href="${escapeHtml(event.href || "")}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(event.domain === "church" ? "Église" : "Commerce")} ${escapeHtml(event.title)}"
    >
      <div class="tx-card-top">
        ${domainBadgeHtml(event.domain)}
        ${typeBadgeHtml(event.type)}
      </div>
      ${amount}
      <p class="tx-fund">${escapeHtml(event.title)}</p>
      <p class="tx-reason">${escapeHtml(event.subtitle)}</p>
      <p class="tx-date">${escapeHtml(formatNumericDateFr(event.date))}</p>
    </article>
  `;
}

export function getLoadedHistoryState() {
  return { loadedEvents, loadedHasMore, visibleCount };
}
