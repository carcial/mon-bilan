import { amountHtml } from "../../components/amount.js";
import { renderGroupedBarChart } from "../../components/charts.js";
import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { iconHtml } from "../../components/icons.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createExpense,
  deleteExpense,
  deleteSale,
  getArrivals,
  getBusinessHistory,
  getBusinessReport,
  getCustomerBalances,
  getCustomerPayments,
  getExpenses,
  getSale,
  getSupplierBalances,
  saleTotal,
} from "../../services/supabase/business.js";
import {
  calculateLineMargin,
  calculateOperatingExpenses,
  customerCashEvents,
  CUSTOMER_CASH_SOURCE,
  validateExpense,
} from "../../utils/business-calc.js";
import { supplierDisplayLabel } from "../../utils/supplier-label.js";
import {
  displayDateFr,
  formatNumericDateFr,
  todayIso,
} from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { getPeriodRange, monthTitleFr, PERIODS, periodLabelFr } from "../../utils/periods.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  bindMoneyInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  emptyStateHtml,
  errorStateHtml,
  EXPENSE_LABELS,
  kindBadgeHtml,
  debtorCardHtml,
  moneyInputHtml,
  pageHeaderHtml,
  METHOD_LABELS,
  SETTLEMENT_LABELS,
  setFieldError,
  skeletonHtml,
  supplierAmountPerUnitLabel,
} from "./business-ui.js";
import {
  businessBordereauPath,
  businessCustomerPath,
  businessSalePath,
  businessSupplierPath,
} from "./business-routes.js";

export function renderReceivables(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Paiements", subtitle: "Ce que les clients doivent encore.", backHref: ROUTES.home, backLabel: "Retour à l'accueil" })}
      <div data-role="body" class="page-body pay-page">${skeletonHtml(4)}</div>
    </section>
  `;
  const body = root.querySelector('[data-role="body"]');
  const today = todayIso();
  Promise.all([
    getCustomerBalances(),
    getCustomerPayments(),
    getBusinessReport({ from: today, to: today }),
  ])
    .then(([balances, payments, todayReport]) => {
      const owing = balances.filter((row) => row.outstanding > 0);
      const total = owing.reduce((sum, row) => sum + row.outstanding, 0);
      const allSales = balances.flatMap((row) => row.sales || []);
      const cashEvents = customerCashEvents({ sales: allSales, payments });
      const todayEvents = cashEvents.filter((row) => row.payment_date === today);
      const todayTotal = todayReport.cashCollected;
      const recent = cashEvents.slice(0, 8);
      body.innerHTML = `
        <div class="pay-summary-grid">
          <article class="card card-accent-business">
            <p class="home-metric-label">À recevoir</p>
            <div>${amountHtml(total, { className: "amount-sm" })}</div>
          </article>
          <article class="card">
            <p class="home-metric-label">Paiements reçus aujourd'hui</p>
            <div>${amountHtml(todayTotal, { className: "amount-sm" })}</div>
            <p class="field-hint">${todayEvents.length} paiement${todayEvents.length > 1 ? "s" : ""}</p>
          </article>
        </div>
        <a class="btn btn-primary btn-block pay-primary-action" href="#${BUSINESS_LINKS.paymentNew}">+ Enregistrer un paiement</a>
        <section class="section-block">
          <h2 class="section-title">Clients qui doivent encore</h2>
        ${
          owing.length
            ? `<div class="list-card">${owing.map(debtorCardHtml).join("")}</div>`
            : emptyStateHtml({ title: "Personne ne doit d'argent." })
        }
        </section>
        <section class="section-block">
          <h2 class="section-title">Paiements récents</h2>
          ${paymentListHtml(recent, "Aucun paiement récent.")}
        </section>
      `;
    })
    .catch((err) => {
      body.innerHTML = errorStateHtml(friendlyError(err));
    });
}

function paymentListHtml(rows, empty) {
  if (!rows.length) return `<p class="field-hint">${escapeHtml(empty)}</p>`;
  return `<div class="list-card">${rows
    .map((pay) => {
      const atSale = pay.source === CUSTOMER_CASH_SOURCE.atSale || pay.note === "À la vente";
      const method = METHOD_LABELS[pay.payment_method] || pay.payment_method || "";
      const bits = [
        formatNumericDateFr(pay.payment_date),
        pay.customers?.name || "Client",
        method,
        atSale ? "À la vente" : "",
      ].filter(Boolean);
      return `
    <article class="list-row">
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(formatFcfa(pay.amount_fcfa))}</span>
        <span class="list-row-meta">${escapeHtml(bits.join(" · "))}</span>
      </span>
    </article>
  `;
    })
    .join("")}</div>`;
}

export function renderPayables(root) {
  ledgerPage(root, {
    title: "À payer",
    load: getSupplierBalances,
    empty: "Rien à payer aux fournisseurs.",
    totalLabel: "Total à payer",
    href: (row) => businessSupplierPath(row.supplier.id),
    name: (row) => supplierDisplayLabel(row.supplier),
    extra: () => "",
  });
}

function ledgerPage(root, { title, load, empty, totalLabel, href, name, extra }) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title, backHref: ROUTES.home, backLabel: "Retour à l'accueil" })}
      <div class="filter-row" data-role="sort" style="margin-bottom:1rem">
        <button type="button" class="filter-chip is-active" data-sort="amount">Montant le plus élevé</button>
        <button type="button" class="filter-chip" data-sort="oldest">Plus ancien</button>
      </div>
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  let sort = "amount";
  const body = root.querySelector('[data-role="body"]');
  const refresh = async () => {
    try {
      const rows = (await load()).filter((row) => row.outstanding > 0);
      if (sort === "oldest") {
        rows.sort((a, b) => String(a.oldestUnpaid || "").localeCompare(String(b.oldestUnpaid || "")));
      } else {
        rows.sort((a, b) => b.outstanding - a.outstanding);
      }
      const total = rows.reduce((sum, row) => sum + row.outstanding, 0);
      if (!rows.length) {
        body.innerHTML = emptyStateHtml({ title: empty });
        return;
      }
      body.innerHTML = `
        <article class="card card-accent-business">
          <p class="home-metric-label">${escapeHtml(totalLabel)}</p>
          <div>${amountHtml(total)}</div>
        </article>
        <div class="list-card">
          ${rows
            .map(
              (row) => `
            <a class="list-row" href="#${href(row)}">
              <span class="list-row-icon">${iconHtml("user", { weight: "bold" })}</span>
              <span class="list-row-body">
                <span class="list-row-title">${escapeHtml(name(row))}</span>
                ${extra(row) ? `<span class="list-row-meta">${escapeHtml(extra(row))}</span>` : ""}
              </span>
              <span class="list-row-amount">${amountHtml(row.outstanding, { className: "amount-sm" })}</span>
            </a>
          `,
            )
            .join("")}
        </div>
      `;
    } catch (err) {
      body.innerHTML = errorStateHtml(friendlyError(err));
    }
  };
  root.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sort = btn.getAttribute("data-sort") || "amount";
      root.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("is-active", b === btn));
      refresh();
    });
  });
  refresh();
}

export function renderExpenses(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Dépenses",
        subtitle: "Tous les frais enregistrés pour le commerce.",
        backHref: ROUTES.business,
        backLabel: "Retour au commerce",
      })}
      <div data-role="body" class="page-body pay-page">${skeletonHtml(4)}</div>
    </section>
  `;
  loadExpenses(root.querySelector('[data-role="body"]'), ctx);
}

async function loadExpenses(body, ctx) {
  try {
    const rows = await getExpenses();
    const today = todayIso();
    const todayRows = rows.filter((row) => row.expense_date === today);
    const opexTotal = calculateOperatingExpenses(rows);
    const todayTotal = calculateOperatingExpenses(todayRows);
    body.innerHTML = `
      <div class="pay-summary-grid">
        <article class="card card-accent-business">
          <p class="home-metric-label">Dépenses d'exploitation</p>
          <div>${amountHtml(opexTotal, { className: "amount-sm" })}</div>
          <p class="field-hint">${rows.length} enregistrement${rows.length > 1 ? "s" : ""}</p>
        </article>
        <article class="card">
          <p class="home-metric-label">Aujourd'hui</p>
          <div>${amountHtml(todayTotal, { className: "amount-sm" })}</div>
          <p class="field-hint">${todayRows.length} dépense${todayRows.length > 1 ? "s" : ""}</p>
        </article>
      </div>
      <a class="btn btn-primary btn-block pay-primary-action" href="#${BUSINESS_LINKS.expenseNew}">+ Nouvelle dépense</a>
      <section class="section-block">
        <h2 class="section-title">Toutes les dépenses</h2>
        ${expenseListHtml(rows)}
      </section>
    `;
    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const result = await confirmAndWrite(
          {
            title: "SUPPRIMER CETTE DÉPENSE ?",
            confirmLabel: "Supprimer définitivement",
            cancelLabel: "Annuler",
            danger: true,
          },
          () => deleteExpense(btn.getAttribute("data-del")),
        );
        if (result.status === "confirm") {
          ctx.onChanged?.();
          loadExpenses(body, ctx);
        }
      });
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

function expenseListHtml(rows) {
  if (!rows.length) {
    return emptyStateHtml({
      title: "Aucune dépense enregistrée.",
      actionHref: BUSINESS_LINKS.expenseNew,
      actionLabel: "Nouvelle dépense",
    });
  }
  return `<div class="list-card">${rows
    .map((row) => {
      const allocated = Boolean(row.is_arrival_cost_allocation);
      return `
      <article class="list-row">
        <span class="list-row-body">
          <span class="list-row-title">${escapeHtml(row.description || EXPENSE_LABELS[row.category] || row.category)}</span>
          <span class="list-row-meta">${escapeHtml(EXPENSE_LABELS[row.category] || row.category)} · ${escapeHtml(formatNumericDateFr(row.expense_date))}${
            allocated ? " · Déjà dans l'arrivage" : ""
          }</span>
        </span>
        <span class="list-row-side">
          <span class="list-row-amount">${amountHtml(row.amount_fcfa, { className: "amount-sm" })}</span>
          <button type="button" class="btn btn-ghost" data-del="${escapeHtml(row.id)}">Supprimer</button>
        </span>
      </article>`;
    })
    .join("")}</div>`;
}

export function renderExpenseForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Nouvelle dépense", backHref: BUSINESS_LINKS.expenses, backLabel: "Retour aux dépenses" })}
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  loadExpenseForm(root.querySelector('[data-role="body"]'), ctx);
}

async function loadExpenseForm(body, ctx) {
  try {
    const arrivals = await getArrivals();
    body.innerHTML = `
      <form class="church-form stack" data-role="form">
        ${choiceFieldHtml({
          id: "ex-cat",
          name: "category",
          label: "Catégorie",
          options: Object.entries(EXPENSE_LABELS).map(([id, name]) => ({ id, name })),
          selectedId: Object.keys(EXPENSE_LABELS)[0] || "",
          placeholder: "Choisir une catégorie",
        })}
        ${moneyInputHtml("ex-amount", "amount", "Montant")}
        ${dateFieldHtml({ id: "ex-date", name: "date", label: "Date", value: todayIso() })}
        ${
          arrivals.length
            ? choiceFieldHtml({
                id: "ex-arr",
                name: "arrivalId",
                label: "Arrivage lié",
                options: [{ id: "", name: "Aucun" }, ...arrivals],
                selectedId: "",
                placeholder: "Aucun",
                labelFn: (a) =>
                  a.id
                    ? `${supplierDisplayLabel(a.suppliers)} · ${a.products?.name || ""} · ${formatNumericDateFr(a.arrival_date)}`
                    : "Aucun",
              })
            : `<input type="hidden" name="arrivalId" value="" />`
        }
        <label class="field-check">
          <input type="checkbox" name="allocation" />
          Déjà inclus dans le coût de l'arrivage (ne pas compter deux fois)
        </label>
        <div class="field">
          <label class="field-label" for="ex-desc">Motif</label>
          <input id="ex-desc" name="description" class="field-input" placeholder="Ex. Frais de marché" />
          <p class="field-error" data-error="description" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="ex-note">Note <span class="field-optional">(facultatif)</span></label>
          <textarea id="ex-note" name="note" class="field-input field-textarea" rows="2" placeholder="Ex. Paiement prévu vendredi"></textarea>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Continuer</button>
      </form>
    `;
    const form = body.querySelector("form");
    bindChoiceFields(form);
    bindDateFields(form);
    form.querySelectorAll("[data-money]").forEach((el) => bindMoneyInput(el));
    const guard = createSubmitGuard();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (guard.isLocked()) return;
      await guard.run(async () => {
        clearFieldErrors(form);
        const values = {
          category: form.elements.namedItem("category")?.value,
          amount: form.elements.namedItem("amount")?.dataset?.amount
            || form.elements.namedItem("amount")?.value,
          date: form.elements.namedItem("date")?.value,
          arrivalId: form.elements.namedItem("arrivalId")?.value,
          isArrivalCostAllocation: Boolean(form.elements.namedItem("allocation")?.checked),
          description: form.elements.namedItem("description")?.value,
          note: form.elements.namedItem("note")?.value,
        };
        const validated = validateExpense(values);
        if (!validated.ok) {
          Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
          return;
        }
        const result = await confirmAndWrite(
          {
            title: "CONFIRMER LA DÉPENSE",
            amountHtml: amountHtml(validated.amount),
            extraHtml: values.isArrivalCostAllocation
              ? `<p class="field-hint">Cette dépense ne sera pas retranchée du résultat : elle est déjà dans le coût de l'arrivage.</p>`
              : "",
            rows: [
              { label: "Catégorie", value: EXPENSE_LABELS[values.category] },
              { label: "Motif", value: values.description },
              { label: "Date", value: displayDateFr(values.date) },
            ],
          },
          () =>
            createExpense({
              ...values,
              amount: validated.amount,
            }),
        );
        if (result.status === "confirm") {
          ctx.onChanged?.();
          navigate(BUSINESS_LINKS.expenses);
        }
      });
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

export function renderSaleDetail(root, ctx) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Vente", backHref: ROUTES.business, backLabel: "Retour au commerce" })}
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;
  loadSale(root.querySelector('[data-role="body"]'), ctx);
}

async function loadSale(body, ctx) {
  try {
    const sale = await getSale(ctx.id);
    if (!sale) {
      body.innerHTML = errorStateHtml("Vente introuvable.");
      return;
    }
    const item = sale.sale_items?.[0];
    const total = saleTotal(sale);
    const unitType = item?.products?.unit_type;
    const supplierAmount = item?.stock_arrivals?.supplier_unit_price_fcfa;
    const salePrice = item?.sale_unit_price_fcfa;
    const margin =
      supplierAmount == null || salePrice == null || item?.quantity == null
        ? null
        : calculateLineMargin(item.quantity, salePrice, supplierAmount);
    body.innerHTML = `
      <article class="card">
        <p class="tx-kind tx-kind-out">VENTE · ${escapeHtml(SETTLEMENT_LABELS[sale.settlement_status] || "")}</p>
        <div>${amountHtml(total)}</div>
        <dl class="detail-list">
          <div><dt>Client</dt><dd><a href="#${businessCustomerPath(sale.customer_id)}">${escapeHtml(sale.customers?.name || "")}</a></dd></div>
          <div><dt>Produit</dt><dd>${escapeHtml(item?.products?.name || "")}</dd></div>
          <div><dt>Quantité</dt><dd>${item?.quantity ?? "—"}</dd></div>
          <div><dt>${escapeHtml(supplierAmountPerUnitLabel(unitType))}</dt><dd>${supplierAmount == null ? "—" : escapeHtml(formatFcfa(supplierAmount))}</dd></div>
          <div><dt>Prix de vente</dt><dd>${escapeHtml(formatFcfa(salePrice || 0))}</dd></div>
          <div><dt>Marge estimée</dt><dd>${margin == null ? "—" : escapeHtml(formatFcfa(margin))}</dd></div>
          <div><dt>Statut</dt><dd>${escapeHtml(SETTLEMENT_LABELS[sale.settlement_status] || "—")}</dd></div>
          <div><dt>Mode</dt><dd>${escapeHtml(METHOD_LABELS[sale.payment_method] || "—")}</dd></div>
          <div><dt>Payé à la vente</dt><dd>${escapeHtml(formatFcfa(sale.amount_paid_fcfa))}</dd></div>
          <div><dt>Date</dt><dd>${escapeHtml(displayDateFr(sale.sale_date))}</dd></div>
          <div><dt>Remboursement</dt><dd>${escapeHtml(repayLabel(sale))}</dd></div>
        </dl>
      </article>
      <button type="button" class="btn btn-danger btn-block" data-action="delete">Supprimer</button>
    `;
    body.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      const result = await confirmAndWrite(
        {
          title: "SUPPRIMER CETTE VENTE ?",
          amountHtml: amountHtml(total),
          extraHtml: `<div class="warning-box"><p>Cette action remettra la quantité dans le stock. Les paiements liés empêchent la suppression.</p></div>`,
          confirmLabel: "Supprimer définitivement",
          cancelLabel: "Annuler",
          danger: true,
        },
        () => deleteSale(sale.id),
      );
      if (result.status === "confirm") {
        ctx.onChanged?.();
        navigate(BUSINESS_LINKS.history);
      }
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

function repayLabel(sale) {
  if (sale.repayment_expectation === "exact" && sale.repayment_exact_date) {
    return `Date exacte : ${displayDateFr(sale.repayment_exact_date)}`;
  }
  if (sale.repayment_expectation === "approximate") {
    return sale.repayment_approx_text || "Approximatif";
  }
  return "Non déterminé";
}

let historyKind = "";

export function renderBusinessHistory(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Historique",
        subtitle: "Opérations du commerce uniquement.",
        backHref: ROUTES.business,
        backLabel: "Retour au commerce",
      })}
      <div class="page-body">
      <div class="filter-row" style="margin-bottom:0">
        ${[
          ["", "Toutes"],
          ["arrival", "Arrivages"],
          ["sale", "Ventes"],
          ["customer_payment", "Paiements clients"],
          ["supplier_payment", "Paiements fournisseurs"],
          ["expense", "Dépenses"],
          ["adjustment", "Stock"],
        ]
          .map(
            ([value, label]) =>
              `<button type="button" class="filter-chip${historyKind === value ? " is-active" : ""}" data-kind="${value}">${label}</button>`,
          )
          .join("")}
      </div>
      <div data-role="body">${skeletonHtml(3)}</div>
      </div>
    </section>
  `;
  const body = root.querySelector('[data-role="body"]');
  const refresh = () => loadHistory(body);
  root.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      historyKind = btn.getAttribute("data-kind") || "";
      root.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("is-active", b === btn));
      refresh();
    });
  });
  refresh();
}

async function loadHistory(body) {
  try {
    const rows = await getBusinessHistory({ kind: historyKind || undefined });
    if (!rows.length) {
      body.innerHTML = emptyStateHtml({
        title: "Aucune opération pour le moment.",
        actionHref: BUSINESS_LINKS.sale,
        actionLabel: "Nouvelle vente",
      });
      return;
    }
    body.innerHTML = `<div class="list-card">${rows.map(historyCard).join("")}</div>`;
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

function historyCard(entry) {
  const href =
    entry.kind === "sale"
      ? businessSalePath(entry.id)
      : entry.kind === "arrival"
        ? businessBordereauPath(entry.id)
        : entry.kind === "customer_payment"
          ? businessCustomerPath(entry.row.customer_id)
          : entry.kind === "supplier_payment"
            ? businessSupplierPath(entry.row.supplier_id)
            : BUSINESS_LINKS.history;
  const label =
    entry.kind === "sale"
      ? entry.row.customers?.name || "Vente"
      : entry.kind === "arrival"
        ? `${entry.row.suppliers?.code || ""} · ${entry.row.products?.name || ""}`
        : entry.kind === "expense"
          ? entry.row.description
          : entry.kind === "adjustment"
            ? entry.row.reason
            : formatFcfa(entry.row.amount_fcfa || 0);
  const isOut = entry.kind === "sale" || entry.kind === "supplier_payment" || entry.kind === "expense";
  return `
    <a class="list-row" href="#${href}">
      <span class="list-row-icon ${isOut ? "is-out" : "is-in"}">${kindBadgeHtml(entry.kind)}</span>
      <span class="list-row-body">
        <span class="list-row-title">${escapeHtml(label)}</span>
        <span class="list-row-meta">${escapeHtml(formatNumericDateFr(entry.date))}</span>
      </span>
    </a>
  `;
}

let reportPeriod = PERIODS.month;
let reportFrom = "";
let reportTo = "";

export function renderBusinessReport(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Rapport",
        subtitle: "Recettes, coûts et résultat estimé.",
        backHref: ROUTES.business,
      })}
      <div data-role="filters"></div>
      <div class="report-stack" data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;
  const filters = root.querySelector('[data-role="filters"]');
  const body = root.querySelector('[data-role="body"]');
  const paintFilters = () => {
    filters.innerHTML = `
      <div class="filter-panel stack-sm">
        <p class="filter-legend">Période</p>
        <div class="filter-row" role="group" aria-label="Période du rapport">
          ${[
            [PERIODS.today, "Aujourd'hui"],
            [PERIODS.week, "Cette semaine"],
            [PERIODS.month, "Ce mois"],
            [PERIODS.year, "Cette année"],
            [PERIODS.custom, "Personnalisée"],
          ]
            .map(
              ([value, label]) =>
                `<button type="button" class="filter-chip${reportPeriod === value ? " is-active" : ""}" data-period="${value}">${label}</button>`,
            )
            .join("")}
        </div>
        <div class="custom-period${reportPeriod === PERIODS.custom ? "" : " is-hidden"}">
          ${dateFieldHtml({ id: "br-from", name: "from", label: "Date de début", value: reportFrom, dataRole: "from", defaultToday: false })}
          ${dateFieldHtml({ id: "br-to", name: "to", label: "Date de fin", value: reportTo, dataRole: "to", defaultToday: false })}
        </div>
      </div>
    `;
    bindDateFields(filters);
    filters.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        reportPeriod = btn.getAttribute("data-period");
        paintFilters();
        loadReport(body);
      });
    });
    filters.querySelector('[data-role="from"]')?.addEventListener("change", (e) => {
      reportFrom = e.target.value;
      loadReport(body);
    });
    filters.querySelector('[data-role="to"]')?.addEventListener("change", (e) => {
      reportTo = e.target.value;
      loadReport(body);
    });
  };
  paintFilters();
  loadReport(body);
}

async function loadReport(body) {
  const range = getPeriodRange(reportPeriod, { from: reportFrom, to: reportTo });
  if (reportPeriod === PERIODS.custom && (!range.from || !range.to)) {
    body.innerHTML = emptyStateHtml({ title: "Choisissez une période." });
    return;
  }
  body.innerHTML = skeletonHtml(4);
  try {
    const report = await getBusinessReport(range);
    const title =
      reportPeriod === PERIODS.month ? monthTitleFr() : periodLabelFr(reportPeriod, range);
    body.innerHTML = `
      <p class="report-period">${escapeHtml(title)}</p>
      <article class="hero-card">
        <p class="hero-kicker">Résultat estimé</p>
        <div>${amountHtml(report.estimatedProfit, { signed: true })}</div>
        <div class="hero-metrics">
          <div class="hero-metric"><span>Ventes</span><strong>${escapeHtml(formatFcfa(report.revenue))}</strong></div>
          <div class="hero-metric"><span>Dépenses</span><strong>${escapeHtml(formatFcfa(report.operatingExpenses))}</strong></div>
          <div class="hero-metric"><span>Cash reçu</span><strong>${escapeHtml(formatFcfa(report.cashCollected))}</strong></div>
        </div>
      </article>
      <article class="chart-card">
        <h2 class="section-title">Recettes, coûts et dépenses</h2>
        <div class="chart-frame">
          <canvas data-role="business-report-chart" aria-label="Recettes, coûts et dépenses"></canvas>
        </div>
      </article>
      <article class="list-card">
        <div class="today-metrics">
          <div class="today-metric"><span>Crédit des ventes</span><strong>${escapeHtml(formatFcfa(report.creditIssued))}</strong></div>
          <div class="today-metric"><span>Montant fournisseur vendu</span><strong>${escapeHtml(formatFcfa(report.cogs))}</strong></div>
          <div class="today-metric"><span>Unités vendues</span><strong>${escapeHtml(String(report.unitsSold))}</strong></div>
          <div class="today-metric"><span>À recevoir</span><strong>${escapeHtml(formatFcfa(report.receivablesTotal))}</strong></div>
          <div class="today-metric"><span>À payer</span><strong>${escapeHtml(formatFcfa(report.payablesTotal))}</strong></div>
        </div>
      </article>
      <p class="field-hint">Le résultat = ventes − montant fournisseur des sacs vendus − dépenses d'exploitation. Les frais d'arrivage (transport, déchargement) ne sont pas retranchés de la marge. Une créance n'est pas du cash. « Crédit des ventes » = non encaissé à la vente, pas le reste actuel des clients.</p>
    `;
    renderGroupedBarChart(body.querySelector('[data-role="business-report-chart"]'), {
      labels: [title],
      series: [
        { label: "Recettes", values: [report.revenue || 0], color: "#F28C28" },
        { label: "Fournisseur", values: [report.cogs || 0], color: "#C56A12" },
        { label: "Dépenses", values: [report.operatingExpenses || 0], color: "#B83A3A" },
      ],
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}
