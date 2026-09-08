import { amountHtml } from "../../components/amount.js";
import { openFilterSheet } from "../../components/filter-sheet.js";
import { iconHtml } from "../../components/icons.js";
import { getHashQuery } from "../../router.js";
import {
  getGlobalHistory,
  getHistoryFilterOptions,
  HISTORY_PAGE_SIZE,
} from "../../services/supabase/history.js";
import { getActiveDomain } from "../../state/app-mode.js";
import { formatNumericDateFr } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import {
  countActiveHistoryFilters,
  historyFiltersFromQuery,
  HISTORY_TYPE_LABELS,
  typeOptionsForDomain,
} from "../../utils/history-events.js";
import { getPeriodRange, PERIODS } from "../../utils/periods.js";
import { bindChoiceFields, choiceFieldHtml, meaningfulFilterFieldHtml } from "../../components/choice-field.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import {
  emptyStateHtml,
  errorStateHtml,
  pageHeaderHtml,
  skeletonHtml,
} from "./history-ui.js";

const DEFAULT_FILTERS = {
  period: PERIODS.month,
  type: "",
  fundId: "",
  supplierId: "",
  customerId: "",
  productId: "",
  search: "",
  from: "",
  to: "",
};

/** @type {typeof DEFAULT_FILTERS} */
let historyFilters = { ...DEFAULT_FILTERS };
let lastHistoryDomain = "";

/** @type {object[]} */
let loadedEvents = [];
let loadedHasMore = false;
let loadingMore = false;

export function renderHistoryScreen(root) {
  loadedEvents = [];
  loadedHasMore = false;
  const domain = getActiveDomain();
  if (lastHistoryDomain && lastHistoryDomain !== domain) {
    historyFilters = { ...DEFAULT_FILTERS };
  }
  lastHistoryDomain = domain;
  const fromQuery = historyFiltersFromQuery(getHashQuery(), historyFilters);
  if (fromQuery) historyFilters = fromQuery;
  const subtitle =
    domain === "church"
      ? "Toutes les opérations de la trésorerie de l'église."
      : historyFilters.type === "sale" && historyFilters.period === PERIODS.today
        ? "Ventes d'aujourd'hui."
        : "Toutes les opérations de votre commerce.";

  root.innerHTML = `
    <section class="page history-page" aria-labelledby="history-title">
      ${pageHeaderHtml({
        title: historyFilters.type === "sale" && historyFilters.period === PERIODS.today ? "Ventes" : "Historique",
        subtitle,
        backHref: fromQuery ? "/" : undefined,
        backLabel: "Retour à l'accueil",
      })}
      <div data-role="toolbar">${skeletonHtml(1)}</div>
      <div data-role="chips"></div>
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
  const toolbarEl = root.querySelector('[data-role="toolbar"]');
  const listEl = root.querySelector('[data-role="list"]');
  if (!toolbarEl || !listEl) return;

  try {
    const options = await getHistoryFilterOptions(getActiveDomain());
    toolbarEl.innerHTML = toolbarHtml();
    bindToolbar(root, options);
    renderChips(root);
    await refreshList(root, options, { reset: true });
  } catch (err) {
    console.warn("[history] load failed", err);
    toolbarEl.innerHTML = "";
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      listEl.innerHTML = skeletonHtml(3);
      loadHistory(root);
    });
  }
}

function searchPlaceholder() {
  return getActiveDomain() === "church"
    ? "Motif, note, opération..."
    : "Client, fournisseur, produit, motif...";
}

function toolbarHtml() {
  const { search } = historyFilters;
  const filterCount = countActiveHistoryFilters(historyFilters, { includeSearch: false });
  return `
    <div class="history-toolbar">
      <label class="sr-only" for="hist-search">Recherche</label>
      <div class="field-with-icon">
        <span class="field-icon">${iconHtml("magnifying-glass", { weight: "bold", size: "sm" })}</span>
        <input
          id="hist-search"
          class="field-input"
          type="search"
          placeholder="${escapeHtml(searchPlaceholder())}"
          value="${escapeHtml(search)}"
          data-role="search"
        />
      </div>
      <button type="button" class="btn btn-secondary history-filter-btn" data-action="filter">
        ${iconHtml("funnel", { weight: "bold", size: "sm" })}
        Filtrer${filterCount ? ` · ${filterCount}` : ""}
      </button>
    </div>
  `;
}

function bindToolbar(root, options) {
  const toolbarEl = root.querySelector('[data-role="toolbar"]');
  if (!toolbarEl) return;

  let searchTimer = 0;
  toolbarEl.querySelector('[data-role="search"]')?.addEventListener("input", (event) => {
    historyFilters.search = String(event.target.value || "").trim();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      renderChips(root);
      refreshList(root, options, { reset: true });
    }, 250);
  });

  toolbarEl.querySelector('[data-action="filter"]')?.addEventListener("click", () => {
    openAdvancedFilters(root, options);
  });
}

function filterSheetHtml(options) {
  const domain = getActiveDomain();
  const { period, type, fundId, supplierId, customerId, productId, from, to } = historyFilters;
  const typeOptions = typeOptionsForDomain(domain);
  const periodButtons = [
    [PERIODS.today, "Aujourd'hui"],
    [PERIODS.week, "Cette semaine"],
    [PERIODS.month, "Ce mois"],
    [PERIODS.year, "Cette année"],
    [PERIODS.custom, "Période personnalisée"],
  ];

  const contextFields =
    domain === "church"
      ? meaningfulFilterFieldHtml({
          id: "draft-fund",
          draftKey: "fundId",
          label: "Caisse",
          options: options.funds || [],
          selectedId: fundId,
          allLabel: "Toutes les caisses",
          labelFn: (fund) => fund.name,
        })
      : `
        ${meaningfulFilterFieldHtml({
          id: "draft-customer",
          draftKey: "customerId",
          label: "Client",
          options: options.customers || [],
          selectedId: customerId,
          allLabel: "Tous les clients",
          labelFn: (row) => row.name,
        })}
        ${meaningfulFilterFieldHtml({
          id: "draft-supplier",
          draftKey: "supplierId",
          label: "Fournisseur",
          options: options.suppliers || [],
          selectedId: supplierId,
          allLabel: "Tous les fournisseurs",
          labelFn: (row) => row.name || row.code,
        })}
        ${meaningfulFilterFieldHtml({
          id: "draft-product",
          draftKey: "productId",
          label: "Produit",
          options: options.products || [],
          selectedId: productId,
          allLabel: "Tous les produits",
          labelFn: (row) => row.name,
        })}
      `;

  return `
    <div class="stack-sm">
      <fieldset class="filter-section">
        <legend>Période</legend>
        <div class="filter-row" role="group" aria-label="Période">
          ${periodButtons
            .map(
              ([value, label]) => `
            <button type="button" class="filter-chip${period === value ? " is-active" : ""}" data-draft-period="${value}">${escapeHtml(label)}</button>
          `,
            )
            .join("")}
        </div>
        <input type="hidden" data-draft="period" value="${escapeHtml(period)}" />
        <div class="custom-period${period === PERIODS.custom ? "" : " is-hidden"}" data-role="custom-period">
          ${dateFieldHtml({ id: "draft-from", name: "from", label: "Date de début", value: from, draftKey: "from", defaultToday: false })}
          ${dateFieldHtml({ id: "draft-to", name: "to", label: "Date de fin", value: to, draftKey: "to", defaultToday: false })}
        </div>
      </fieldset>

      ${choiceFieldHtml({
        id: "draft-type",
        name: "type",
        draftKey: "type",
        label: "Type d’opération",
        selectedId: type,
        options: typeOptions.map(([value, label]) => ({ id: value, name: label })),
        placeholder: "Toutes",
      })}

      ${contextFields}
    </div>
  `;
}

async function openAdvancedFilters(root, options) {
  const modal = document.getElementById("modal-root");
  const pending = openFilterSheet({
    title: "Filtrer",
    bodyHtml: filterSheetHtml(options),
  });
  if (modal) {
    bindChoiceFields(modal);
    bindDateFields(modal);
  }

  modal?.querySelectorAll("[data-draft-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute("data-draft-period") || PERIODS.month;
      const hidden = modal.querySelector('[data-draft="period"]');
      if (hidden) hidden.value = value;
      modal.querySelectorAll("[data-draft-period]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.getAttribute("data-draft-period") === value);
      });
      modal.querySelector('[data-role="custom-period"]')?.classList.toggle(
        "is-hidden",
        value !== PERIODS.custom,
      );
    });
  });

  const result = await pending;
  if (result.status === "dismiss") return;

  if (result.status === "reset") {
    historyFilters = { ...DEFAULT_FILTERS, search: historyFilters.search };
  } else {
    const draft = result.values || {};
    historyFilters.period = draft.period || PERIODS.month;
    historyFilters.type = draft.type || "";
    historyFilters.fundId = draft.fundId || "";
    historyFilters.supplierId = draft.supplierId || "";
    historyFilters.customerId = draft.customerId || "";
    historyFilters.productId = draft.productId || "";
    historyFilters.from = draft.from || "";
    historyFilters.to = draft.to || "";
  }

  const toolbarEl = root.querySelector('[data-role="toolbar"]');
  if (toolbarEl) {
    toolbarEl.innerHTML = toolbarHtml();
    bindToolbar(root, options);
  }
  renderChips(root);
  refreshList(root, options, { reset: true });
}

function renderChips(root) {
  const chipsEl = root.querySelector('[data-role="chips"]');
  if (chipsEl) chipsEl.innerHTML = "";
}

async function refreshList(root, options, { reset = false } = {}) {
  const listEl = root.querySelector('[data-role="list"]');
  if (!listEl) return;

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

  if (reset) {
    loadedEvents = [];
    listEl.innerHTML = skeletonHtml(3);
  }

  try {
    const page = await getGlobalHistory({
      domain: getActiveDomain(),
      from: range.from,
      to: range.to,
      type: historyFilters.type,
      fundId: historyFilters.fundId,
      supplierId: historyFilters.supplierId,
      customerId: historyFilters.customerId,
      productId: historyFilters.productId,
      search: historyFilters.search,
      offset: reset ? 0 : loadedEvents.length,
      pageSize: HISTORY_PAGE_SIZE,
    });

    loadedEvents = reset ? page.items : [...loadedEvents, ...page.items];
    loadedHasMore = page.hasMore;
    renderList(root, options);
  } catch (err) {
    console.warn("[history] list failed", err);
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      refreshList(root, options, { reset: true });
    });
  }
}

function renderList(root, options) {
  const listEl = root.querySelector('[data-role="list"]');
  if (!listEl) return;

  if (!loadedEvents.length) {
    const filtered = countActiveHistoryFilters(historyFilters) > 0;
    listEl.innerHTML = `
      ${emptyStateHtml({
        title: filtered ? "Aucune opération trouvée." : "Aucune opération pour le moment.",
        body: filtered ? "Modifiez les filtres ou réinitialisez pour voir toutes les opérations." : "",
      })}
      ${
        filtered
          ? `<div class="stack-sm">
              <button type="button" class="btn btn-primary btn-block" data-action="open-filters">Modifier les filtres</button>
              <button type="button" class="btn btn-secondary btn-block" data-action="reset-filters">Réinitialiser</button>
            </div>`
          : ""
      }
    `;
    listEl.querySelector('[data-action="open-filters"]')?.addEventListener("click", () => {
      openAdvancedFilters(root, options);
    });
    listEl.querySelector('[data-action="reset-filters"]')?.addEventListener("click", () => {
      historyFilters = { ...DEFAULT_FILTERS };
      const toolbarEl = root.querySelector('[data-role="toolbar"]');
      if (toolbarEl) {
        toolbarEl.innerHTML = toolbarHtml();
        bindToolbar(root, options);
      }
      renderChips(root);
      refreshList(root, options, { reset: true });
    });
    return;
  }

  listEl.innerHTML = `
    <div class="list-card">
      ${loadedEvents.map(eventCardHtml).join("")}
    </div>
    ${
      loadedHasMore
        ? `<button type="button" class="btn btn-secondary btn-block history-more" data-action="more">Voir plus</button>`
        : ""
    }
  `;

  listEl.querySelector('[data-action="more"]')?.addEventListener("click", async (event) => {
    if (loadingMore) return;
    loadingMore = true;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Chargement…";
    await refreshList(root, options, { reset: false });
    loadingMore = false;
  });
}

function eventIcon(type) {
  const map = {
    income: "arrow-down",
    expense: "arrow-up",
    reconciliation: "scales",
    sale: "tag",
    arrival: "package",
    customer_payment: "wallet",
    supplier_payment: "wallet",
    business_expense: "receipt",
    adjustment: "arrows-clockwise",
  };
  return map[type] || "dot";
}

export function eventCardHtml(event) {
  const typeLabel = HISTORY_TYPE_LABELS[event.type] || event.type;
  let title;
  let meta;
  if (event.type === "sale") {
    title = event.customerName || event.subtitle.split(" · ")[0] || "Vente";
    meta = [
      event.productName,
      event.quantity != null ? String(event.quantity) : "",
      event.settlementLabel,
      formatNumericDateFr(event.date),
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (event.type === "income" || event.type === "expense") {
    title = event.title;
    const rest = event.subtitle;
    meta = [rest, formatNumericDateFr(event.date)].filter(Boolean).join(" · ");
  } else {
    title = `${typeLabel} · ${event.subtitle.split(" · ")[0]}`;
    const rest = event.subtitle.includes(" · ")
      ? event.subtitle.split(" · ").slice(1).join(" · ")
      : "";
    meta = [rest, formatNumericDateFr(event.date)].filter(Boolean).join(" · ");
  }
  const amountClass =
    event.direction === "out" ? "amount-negative" : event.direction === "in" ? "amount-positive" : "";
  const amountInner =
    event.amount == null
      ? ""
      : amountHtml(event.amount, { className: "amount-sm", signed: event.direction !== "neutral" });
  const saleHref = escapeHtml(event.href || "/historique");
  const iconClass = event.direction === "out" ? "is-out" : event.direction === "in" ? "is-in" : "";

  if (event.type === "sale") {
    const customerHref = event.customerId
      ? `/commerce/clients/${event.customerId}`
      : "";
    const titleHtml = customerHref
      ? `<a class="list-row-title history-customer-link" href="#${escapeHtml(customerHref)}">${escapeHtml(title)}</a>`
      : `<span class="list-row-title">${escapeHtml(title)}</span>`;
    return `
      <div class="list-row history-card history-card-sale">
        <a class="list-row-icon ${iconClass}" href="#${saleHref}" aria-label="Voir la vente">
          ${iconHtml(eventIcon(event.type), { weight: "bold" })}
        </a>
        <span class="list-row-body">
          ${titleHtml}
          <a class="list-row-meta history-sale-meta" href="#${saleHref}">${escapeHtml(meta)}</a>
        </span>
        ${
          amountInner
            ? `<a class="list-row-amount ${amountClass}" href="#${saleHref}">${amountInner}</a>`
            : ""
        }
      </div>
    `;
  }

  return `
    <a
      class="list-row history-card"
      href="#${saleHref}"
    >
      <span class="list-row-icon ${iconClass}">
        ${iconHtml(eventIcon(event.type), { weight: "bold" })}
      </span>
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(title)}</span>
        <span class="list-row-meta">${escapeHtml(meta)}</span>
      </span>
      ${
        amountInner
          ? `<span class="list-row-amount ${amountClass}">${amountInner}</span>`
          : ""
      }
    </a>
  `;
}

export function getLoadedHistoryState() {
  return { loadedEvents, loadedHasMore, historyFilters };
}
