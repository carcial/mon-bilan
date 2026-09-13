import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { bindFilterPeriodChips, openFilterSheet } from "../../components/filter-sheet.js";
import { iconHtml } from "../../components/icons.js";
import { getHashQuery, ROUTES } from "../../router.js";
import { getChurchFunds, getChurchTransactions } from "../../services/supabase/church.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { getPeriodRange, getWeekRangeInAppZone, PERIODS } from "../../utils/periods.js";
import {
  CHURCH_LINKS,
  churchHistoryRowHtml,
  emptyStateHtml,
  errorStateHtml,
  fundName,
  pageHeaderHtml,
  skeletonHtml,
} from "./church-ui.js";

/** @type {{ period: string, fundId: string, type: string, from: string, to: string }} */
let historyFilters = {
  period: PERIODS.month,
  fundId: "",
  type: "",
  from: "",
  to: "",
  search: "",
};

/**
 * @param {HTMLElement} root
 */
export function renderChurchHistory(root) {
  applyHistoryQuery(getHashQuery());
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

function applyHistoryQuery(query) {
  if (!query || typeof query.get !== "function") return;
  const period = String(query.get("period") || "").trim();
  const type = String(query.get("type") || "").trim();
  const fundId = String(query.get("fundId") || "").trim();
  if (!period && !type && !fundId) return;
  if (period && Object.values(PERIODS).includes(period)) {
    historyFilters.period = period;
  }
  if (type === "income" || type === "expense" || type === "") {
    historyFilters.type = type;
  }
  if (fundId) historyFilters.fundId = fundId;
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

function filtersHtml() {
  const count = [historyFilters.type, historyFilters.fundId]
    .filter(Boolean).length + (historyFilters.period !== PERIODS.month ? 1 : 0);
  return `
    <div class="history-toolbar">
      <label class="sr-only" for="church-hist-search">Recherche</label>
      <div class="field-with-icon">
        <span class="field-icon">${iconHtml("magnifying-glass", { weight: "bold", size: "sm" })}</span>
        <input
          id="church-hist-search"
          class="field-input"
          type="search"
          placeholder="Motif, note, opération..."
          value="${escapeHtml(historyFilters.search || "")}"
          data-role="search"
        />
      </div>
      <button type="button" class="btn btn-secondary history-filter-btn" data-action="filter">
        ${iconHtml("funnel", { weight: "bold", size: "sm" })}
        Filtrer${count ? ` · ${count}` : ""}
      </button>
    </div>
  `;
}

function filterSheetHtml(funds, draft = historyFilters) {
  const { period, fundId, type, from, to } = draft;
  const periodButtons = [
    [PERIODS.today, "Aujourd'hui"],
    [PERIODS.week, "Cette semaine"],
    [PERIODS.month, "Ce mois"],
    [PERIODS.year, "Cette année"],
    [PERIODS.custom, "Période personnalisée"],
  ];
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
          ${dateFieldHtml({ id: "hist-from", name: "from", label: "Date de début", value: from, draftKey: "from", defaultToday: false })}
          ${dateFieldHtml({ id: "hist-to", name: "to", label: "Date de fin", value: to, draftKey: "to", defaultToday: false })}
        </div>
      </fieldset>
      ${choiceFieldHtml({
        id: "hist-type",
        name: "type",
        draftKey: "type",
        label: "Type d’opération",
        selectedId: type,
        options: [
          { id: "", name: "Toutes" },
          { id: "income", name: "Entrées" },
          { id: "expense", name: "Sorties" },
        ],
        placeholder: "Toutes",
      })}
      ${
        funds.length > 1
          ? choiceFieldHtml({
              id: "hist-fund",
              name: "fundId",
              draftKey: "fundId",
              label: "Caisse",
              options: [{ id: "", name: "Toutes les caisses" }, ...funds],
              selectedId: fundId,
              placeholder: "Toutes les caisses",
              labelFn: (fund) => fund.name || "Toutes les caisses",
            })
          : ""
      }
    </div>
  `;
}

function bindFilters(root, funds) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const listEl = root.querySelector('[data-role="list"]');
  if (!filtersEl || !listEl) return;

  let searchTimer = 0;
  filtersEl.querySelector('[data-role="search"]')?.addEventListener("input", (event) => {
    historyFilters.search = String(event.target.value || "").trim();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => refreshList(listEl), 250);
  });

  filtersEl.querySelector('[data-action="filter"]')?.addEventListener("click", async () => {
    const modal = document.getElementById("modal-root");
    const pending = openFilterSheet({
      title: "Filtrer",
      bodyHtml: filterSheetHtml(funds),
      onReset: (layer) => {
        const body = layer.querySelector("[data-role=filter-body]");
        if (!body) return;
        body.innerHTML = filterSheetHtml(funds, {
          period: PERIODS.month,
          fundId: "",
          type: "",
          from: "",
          to: "",
        });
        bindChoiceFields(layer);
        bindDateFields(layer);
        bindFilterPeriodChips(layer, PERIODS.custom);
      },
    });
    if (modal) {
      bindChoiceFields(modal);
      bindDateFields(modal);
      bindFilterPeriodChips(modal, PERIODS.custom);
    }
    const result = await pending;
    if (result.status !== "apply") return;
    const draft = result.values || {};
    historyFilters.period = draft.period || PERIODS.month;
    historyFilters.type = draft.type || "";
    historyFilters.fundId = draft.fundId || "";
    historyFilters.from = draft.from || "";
    historyFilters.to = draft.to || "";
    filtersEl.innerHTML = filtersHtml();
    bindFilters(root, funds);
    refreshList(listEl);
  });
}

async function refreshList(listEl) {
  listEl.innerHTML = skeletonHtml(3);
  try {
    const range =
      historyFilters.period === PERIODS.week
        ? getWeekRangeInAppZone()
        : getPeriodRange(historyFilters.period, {
            from: historyFilters.from,
            to: historyFilters.to,
          });
    const rows = await getChurchTransactions({
      from: range.from,
      to: range.to,
      fundId: historyFilters.fundId || null,
      type: historyFilters.type || null,
    });

    const query = String(historyFilters.search || "").toLowerCase();
    const visible = query
      ? rows.filter((tx) =>
          `${tx.reason || ""} ${tx.note || ""} ${fundName(tx.church_funds)}`.toLowerCase().includes(query),
        )
      : rows;

    if (!visible.length) {
      listEl.innerHTML = emptyStateHtml({
        title: query ? "Aucune opération trouvée." : "Aucune opération pour le moment.",
        body: query
          ? "Modifiez la recherche ou les filtres."
          : "Les entrées et sorties de cette période apparaîtront ici.",
        actionHref: query ? "" : CHURCH_LINKS.income,
        actionLabel: query ? "" : "Ajouter une entrée",
      });
      return;
    }

    listEl.innerHTML = `
      <div class="list-card">
        ${visible.map(churchHistoryRowHtml).join("")}
      </div>
    `;
  } catch (err) {
    console.warn("[church] history list failed", err);
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      refreshList(listEl);
    });
  }
}
