import { amountHtml } from "../../components/amount.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createExpense,
  deleteExpense,
  deleteSale,
  getArrivals,
  getBusinessHistory,
  getBusinessReport,
  getCustomerBalances,
  getExpenses,
  getSale,
  getSupplierBalances,
  saleTotal,
} from "../../services/supabase/business.js";
import { validateExpense } from "../../utils/business-calc.js";
import {
  formatLongDateFr,
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
  moneyInputHtml,
  pageHeaderHtml,
  PAYMENT_LABELS,
  selectHtml,
  setFieldError,
  skeletonHtml,
} from "./business-ui.js";
import {
  businessBordereauPath,
  businessCustomerPath,
  businessSalePath,
  businessSupplierPath,
} from "./business-routes.js";

export function renderReceivables(root) {
  ledgerPage(root, {
    title: "À recevoir",
    load: getCustomerBalances,
    empty: "Aucun client ne doit d'argent.",
    totalLabel: "Total à recevoir",
    href: (row) => businessCustomerPath(row.customer.id),
    name: (row) => row.customer.name,
    extra: (row) =>
      row.oldestUnpaid
        ? `Plus ancienne échéance : ${formatNumericDateFr(row.oldestUnpaid)}`
        : "",
  });
}

export function renderPayables(root) {
  ledgerPage(root, {
    title: "À payer",
    load: getSupplierBalances,
    empty: "Rien à payer aux fournisseurs.",
    totalLabel: "Total à payer",
    href: (row) => businessSupplierPath(row.supplier.id),
    name: (row) => `${row.supplier.code} — ${row.supplier.name}`,
    extra: () => "",
  });
}

function ledgerPage(root, { title, load, empty, totalLabel, href, name, extra }) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title, backHref: ROUTES.business })}
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
        <div class="tx-list">
          ${rows
            .map(
              (row) => `
            <a class="card tx-card" href="#${href(row)}" style="text-decoration:none">
              <p class="tx-fund">${escapeHtml(name(row))}</p>
              <div>${amountHtml(row.outstanding, { className: "amount-sm" })}</div>
              ${extra(row) ? `<p class="field-hint">${escapeHtml(extra(row))}</p>` : ""}
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
      ${pageHeaderHtml({ title: "Dépenses", backHref: ROUTES.business })}
      <a class="btn btn-secondary btn-block" href="#${BUSINESS_LINKS.expenseNew}" style="margin-bottom:1rem">+ Nouvelle dépense</a>
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  loadExpenses(root.querySelector('[data-role="body"]'), ctx);
}

async function loadExpenses(body, ctx) {
  try {
    const rows = await getExpenses();
    const visible = rows.filter((r) => !r.is_arrival_cost_allocation);
    if (!visible.length) {
      body.innerHTML = emptyStateHtml({
        title: "Aucune dépense enregistrée.",
        actionHref: BUSINESS_LINKS.expenseNew,
        actionLabel: "Nouvelle dépense",
      });
      return;
    }
    body.innerHTML = `<div class="tx-list">${visible
      .map(
        (row) => `
      <article class="card">
        <p class="tx-date">${escapeHtml(formatNumericDateFr(row.expense_date))}</p>
        <p class="tx-fund">${escapeHtml(EXPENSE_LABELS[row.category] || row.category)}</p>
        <div>${amountHtml(row.amount_fcfa, { className: "amount-sm" })}</div>
        <p>${escapeHtml(row.description)}</p>
        <button type="button" class="btn btn-ghost" data-del="${escapeHtml(row.id)}">Supprimer</button>
      </article>
    `,
      )
      .join("")}</div>`;
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

export function renderExpenseForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Nouvelle dépense", backHref: BUSINESS_LINKS.expenses })}
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
        <div class="field">
          <label class="field-label" for="ex-cat">Catégorie</label>
          <select id="ex-cat" name="category" class="field-input">
            ${Object.entries(EXPENSE_LABELS)
              .map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`)
              .join("")}
          </select>
          <p class="field-error" data-error="category" hidden></p>
        </div>
        ${moneyInputHtml("ex-amount", "amount", "Montant")}
        <div class="field">
          <label class="field-label" for="ex-date">Date</label>
          <input id="ex-date" name="date" type="date" class="field-input" value="${todayIso()}" />
          <p class="field-error" data-error="date" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="ex-arr">Arrivage lié <span class="field-optional">(facultatif)</span></label>
          <select id="ex-arr" name="arrivalId" class="field-input">
            <option value="">Aucun</option>
            ${selectHtml(arrivals, "", {
              labelFn: (a) => `${a.suppliers?.code || ""} · ${a.products?.name || ""} · ${a.arrival_date}`,
            })}
          </select>
        </div>
        <label class="field-check">
          <input type="checkbox" name="allocation" />
          Déjà inclus dans le coût de l'arrivage (ne pas compter deux fois)
        </label>
        <div class="field">
          <label class="field-label" for="ex-desc">Motif</label>
          <input id="ex-desc" name="description" class="field-input" />
          <p class="field-error" data-error="description" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="ex-note">Note <span class="field-optional">(facultatif)</span></label>
          <textarea id="ex-note" name="note" class="field-input field-textarea" rows="3"></textarea>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Continuer</button>
      </form>
    `;
    const form = body.querySelector("form");
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
              { label: "Date", value: formatLongDateFr(values.date) },
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
      ${pageHeaderHtml({ title: "Vente", backHref: BUSINESS_LINKS.history, backLabel: "Retour à l'historique" })}
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
    body.innerHTML = `
      <article class="card">
        <p class="tx-kind tx-kind-out">VENTE · ${escapeHtml(PAYMENT_LABELS[sale.payment_method] || "")}</p>
        <div>${amountHtml(total)}</div>
        <dl class="detail-list">
          <div><dt>Client</dt><dd><a href="#${businessCustomerPath(sale.customer_id)}">${escapeHtml(sale.customers?.name || "")}</a></dd></div>
          <div><dt>Produit</dt><dd>${escapeHtml(item?.products?.name || "")}</dd></div>
          <div><dt>Quantité</dt><dd>${item?.quantity ?? "—"}</dd></div>
          <div><dt>Prix unitaire</dt><dd>${escapeHtml(formatFcfa(item?.sale_unit_price_fcfa || 0))}</dd></div>
          <div><dt>Coût réel</dt><dd>${item?.effective_unit_cost_fcfa == null ? "—" : escapeHtml(formatFcfa(item.effective_unit_cost_fcfa))}</dd></div>
          <div><dt>Payé à la vente</dt><dd>${escapeHtml(formatFcfa(sale.amount_paid_fcfa))}</dd></div>
          <div><dt>Date</dt><dd>${escapeHtml(formatLongDateFr(sale.sale_date))}</dd></div>
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
    return `Date exacte : ${formatLongDateFr(sale.repayment_exact_date)}`;
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
      })}
      <div class="filter-row" style="margin-bottom:1rem">
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
    body.innerHTML = `<div class="tx-list">${rows.map(historyCard).join("")}</div>`;
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
  return `
    <a class="card tx-card" href="#${href}" style="text-decoration:none">
      <div class="tx-card-top">${kindBadgeHtml(entry.kind)}</div>
      <p class="tx-date">${escapeHtml(formatNumericDateFr(entry.date))}</p>
      <p class="tx-reason">${escapeHtml(label)}</p>
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
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;
  const filters = root.querySelector('[data-role="filters"]');
  const body = root.querySelector('[data-role="body"]');
  const paintFilters = () => {
    filters.innerHTML = `
      <div class="filter-panel stack-sm">
        <div class="filter-row">
          ${[
            [PERIODS.today, "Aujourd'hui"],
            [PERIODS.week, "Semaine"],
            [PERIODS.month, "Mois"],
            [PERIODS.year, "Année"],
            [PERIODS.custom, "Période"],
          ]
            .map(
              ([value, label]) =>
                `<button type="button" class="filter-chip${reportPeriod === value ? " is-active" : ""}" data-period="${value}">${label}</button>`,
            )
            .join("")}
        </div>
        <div class="custom-period${reportPeriod === PERIODS.custom ? "" : " is-hidden"}">
          <div class="field"><label class="field-label" for="br-from">Du</label><input id="br-from" type="date" class="field-input" value="${escapeHtml(reportFrom)}" data-role="from" /></div>
          <div class="field"><label class="field-label" for="br-to">Au</label><input id="br-to" type="date" class="field-input" value="${escapeHtml(reportTo)}" data-role="to" /></div>
        </div>
      </div>
    `;
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
      <article class="card card-accent-business">
        <p class="home-metric-label">Recettes</p><div>${amountHtml(report.revenue, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Cash reçu</p><div>${amountHtml(report.cashCollected, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Crédit accordé</p><div>${amountHtml(report.creditIssued, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Coût des ventes</p><div>${amountHtml(report.cogs, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Dépenses d'exploitation</p><div>${amountHtml(report.operatingExpenses, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Résultat estimé</p><div>${amountHtml(report.estimatedProfit, { className: "amount-sm", signed: true })}</div>
        <p class="home-metric-label">Unités vendues</p><p class="metric-plain">${report.unitsSold}</p>
      </article>
      <div class="fund-grid">
        <article class="card"><p class="home-metric-label">À recevoir</p><div>${amountHtml(report.receivablesTotal, { className: "amount-sm" })}</div></article>
        <article class="card"><p class="home-metric-label">À payer</p><div>${amountHtml(report.payablesTotal, { className: "amount-sm" })}</div></article>
      </div>
      <p class="field-hint">Le résultat = recettes − coût des sacs vendus − dépenses d'exploitation. Les frais déjà inclus dans un arrivage ne sont pas retranchés une seconde fois. Une créance n'est pas du cash.</p>
    `;
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}
