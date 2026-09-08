import { formatFcfa, toFcfaInteger } from "../../utils/money.js";
import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";
import { iconHtml } from "../../components/icons.js";
import { amountHtml } from "../../components/amount.js";
import { pageHeaderHtml as sharedPageHeaderHtml, backLinkHtml } from "../../components/page-header.js";
import { sumAvailableInventory } from "../../utils/business-calc.js";
import { formatNumericDateFr } from "../../utils/dates.js";
import { businessCustomerPath } from "./business-routes.js";

export const BUSINESS_LINKS = {
  home: ROUTES.business,
  sale: "/commerce/vente",
  arrival: "/commerce/arrivee",
  customers: "/commerce/clients",
  customerNew: "/commerce/clients/nouveau",
  suppliers: "/commerce/fournisseurs",
  supplierNew: "/commerce/fournisseurs/nouveau",
  products: "/commerce/produits",
  productNew: "/commerce/produits/nouveau",
  stock: "/commerce/stock",
  adjustment: "/commerce/stock/ajustement",
  expenses: "/commerce/depenses",
  expenseNew: "/commerce/depenses/nouvelle",
  bordereaux: "/commerce/bordereaux",
  receivables: "/commerce/a-recevoir",
  paymentNew: "/commerce/a-recevoir/paiement",
  payables: "/commerce/a-payer",
  history: "/commerce/historique",
  report: "/commerce/rapport",
  todaySales: "/historique?period=today&type=sale",
  todayCustomers: "/commerce/clients?period=today",
  allSales: "/historique?type=sale",
  supplierPay: "/commerce/a-payer",
};

export const EXPENSE_LABELS = {
  transport: "Transport",
  unloading: "Déchargement",
  workers: "Employés",
  market_fees: "Frais de marché",
  rent: "Loyer",
  taxes: "Taxes",
  phone: "Téléphone",
  other: "Autre",
};

export const SETTLEMENT_LABELS = {
  paid: "Payé en totalité",
  partial: "Paiement partiel",
  credit: "À crédit",
};

export const METHOD_LABELS = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  bank: "Virement bancaire",
};

export const METHOD_OPTIONS = [
  ["cash", "Espèces"],
  ["mobile_money", "Mobile Money"],
  ["bank", "Virement bancaire"],
];

export function methodCardsHtml(selected = "cash") {
  return `
    <p class="field-label" id="pay-method-label">Mode de paiement</p>
    <div class="method-cards" role="radiogroup" aria-labelledby="pay-method-label">
      ${METHOD_OPTIONS.map(
        ([value, label]) => `
        <button type="button" class="method-card${selected === value ? " is-active" : ""}" data-method="${value}">
          ${escapeHtml(label)}
        </button>
      `,
      ).join("")}
    </div>
    <input type="hidden" name="paymentMethod" value="${escapeHtml(selected)}" />
    <p class="field-error" data-error="paymentMethod" hidden></p>
  `;
}

export function bindMethodCards(root) {
  if (!root) return;
  root.querySelectorAll("[data-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hidden = root.querySelector('[name="paymentMethod"]');
      if (hidden) hidden.value = btn.getAttribute("data-method") || "cash";
      root.querySelectorAll("[data-method]").forEach((el) => el.classList.toggle("is-active", el === btn));
    });
  });
}

/** @deprecated mixed labels — use SETTLEMENT_LABELS / METHOD_LABELS */
export const PAYMENT_LABELS = {
  ...SETTLEMENT_LABELS,
  ...METHOD_LABELS,
  credit: "À crédit",
  partial: "Paiement partiel",
};

export { backLinkHtml };

export function pageHeaderHtml(props = {}) {
  return sharedPageHeaderHtml({
    kicker: "Commerce",
    backLabel: "Retour au commerce",
    titleId: "business-title",
    ...props,
  });
}

export function skeletonHtml(lines = 3) {
  const items = Array.from({ length: lines }, (_, i) => {
    const wide = i === 0 ? " skeleton-line-lg" : "";
    return `<div class="skeleton-line${wide}"></div>`;
  }).join("");
  return `<div class="card skeleton-card" aria-hidden="true">${items}</div>`;
}

export function lastPaymentLine(lastPayment) {
  if (!lastPayment || toFcfaInteger(lastPayment.amount_fcfa) <= 0) return "Aucun";
  const date = lastPayment.payment_date || lastPayment.sale_date;
  return `${formatFcfa(lastPayment.amount_fcfa)} · ${formatNumericDateFr(date)}`;
}

export function debtorDueLine(dueSale) {
  if (dueSale?.repayment_expectation === "exact" && dueSale.repayment_exact_date) {
    return formatNumericDateFr(dueSale.repayment_exact_date);
  }
  if (dueSale?.repayment_expectation === "approximate") {
    const text = String(dueSale.repayment_approx_text || "").trim();
    return text || "Indéterminée";
  }
  return "Indéterminée";
}

export function debtorCardHtml(row) {
  const last = lastPaymentLine(row.lastPayment);
  const dueText = debtorDueLine(row.dueSale);
  return `
    <a class="list-row debtor-card" href="#${businessCustomerPath(row.customer.id)}">
      <span class="debtor-head">
        <span class="list-row-title">${escapeHtml(row.customer.name)}</span>
        <span class="debtor-amount">
          ${amountHtml(row.outstanding, { className: "amount-sm" })}
          <span class="debtor-amount-label">à recevoir</span>
        </span>
      </span>
      <span class="debtor-block">
        <span class="debtor-kicker">Dernier paiement</span>
        <span>${escapeHtml(last)}</span>
      </span>
      <span class="debtor-block">
        <span class="debtor-kicker">Échéance</span>
        <span>${escapeHtml(dueText)}</span>
      </span>
    </a>`;
}

export function emptyStateHtml({ title, body, actionHref, actionLabel }) {
  return `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${
        actionHref && actionLabel
          ? `<a class="btn btn-primary" href="#${actionHref}">${escapeHtml(actionLabel)}</a>`
          : ""
      }
    </div>
  `;
}

export function errorStateHtml(message) {
  return `
    <div class="empty-state empty-state-error" role="alert">
      <h2>Impossible de charger</h2>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary" data-action="retry">Réessayer</button>
    </div>
  `;
}

export function selectHtml(rows, selectedId, { valueKey = "id", labelFn, includeAll, allLabel } = {}) {
  const options = [];
  if (includeAll) {
    options.push(`<option value="">${escapeHtml(allLabel || "Tous")}</option>`);
  }
  for (const row of rows) {
    const value = row[valueKey];
    const label = labelFn ? labelFn(row) : row.name;
    const selected = value === selectedId ? " selected" : "";
    options.push(`<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`);
  }
  return options.join("");
}

export function noteIndicatorHtml(note) {
  if (!note || !String(note).trim()) return "";
  return `<span class="tx-note-flag">Note</span>`;
}

export function bindMoneyInput(input) {
  const apply = () => {
    const raw = input.value;
    const digits = raw.replace(/\s/g, "").replace(/[^\d]/g, "");
    if (!digits) {
      input.value = "";
      input.dataset.amount = "";
      return;
    }
    const n = Number.parseInt(digits, 10);
    input.dataset.amount = String(n);
    input.value = formatFcfa(n, { showCurrency: false });
  };
  input.addEventListener("input", apply);
  if (input.value) apply();
}

export function bindIntegerInput(input) {
  const apply = () => {
    const digits = input.value.replace(/\s/g, "").replace(/[^\d]/g, "");
    if (!digits) {
      input.value = "";
      input.dataset.amount = "";
      return;
    }
    input.dataset.amount = String(Number.parseInt(digits, 10));
    input.value = digits;
  };
  input.addEventListener("input", apply);
  if (input.value) apply();
}

export function setFieldError(form, name, message) {
  const el = form.querySelector(`[data-error="${name}"]`);
  if (!el) return;
  if (message) {
    el.hidden = false;
    el.textContent = message;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

export function clearFieldErrors(form) {
  form.querySelectorAll("[data-error]").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

export function unitLabel(unitType = "sac", quantity = 1) {
  const unit = unitType || "unité";
  if (quantity > 1 && unit === "sac") return "sacs";
  return unit;
}

export function stockAvailableCompact(units, unitType = "") {
  const n = Number(units) || 0;
  const type = unitType || "unité";
  const unit = type === "unité"
    ? n > 1 ? "unités" : "unité"
    : unitLabel(type, n);
  return `${n} ${unit}`;
}

export function stockAvailablePhrase(units, unitType = "") {
  const n = Number(units) || 0;
  const type = unitType || "unité";
  const unit = type === "unité"
    ? n > 1 ? "unités" : "unité"
    : unitLabel(type, n);
  const adj = n > 1 ? "disponibles" : "disponible";
  return `${n} ${unit} ${adj}`;
}

export function stockUnitTypeFromInventory(inventory = []) {
  const types = [...new Set((inventory || []).map((row) => row.unit_type).filter(Boolean))];
  return types.length === 1 ? types[0] : "";
}

export function marginOutcomeLabel(margin) {
  const n = Number(margin) || 0;
  if (n > 0) return "Gain";
  if (n < 0) return "Perte";
  return "Équilibre";
}

/** Amount the supplier expects for each bag/unit — not a blended cost after fees. */
export function supplierAmountPerUnitLabel(unitType = "sac") {
  return `Montant fournisseur par ${unitType || "unité"}`;
}

/**
 * Home stock row: one compact available-quantity phrase, never a duplicate integer.
 * @param {{ href: string, inventory?: object[], stockUnits?: number }} props
 */
export function stockWatchHtml({ href, inventory = [], stockUnits }) {
  const units = stockUnits ?? sumAvailableInventory(inventory);
  const phrase = stockAvailablePhrase(units, stockUnitTypeFromInventory(inventory));

  return `
    <a class="list-row ops-watch-row" href="#${href}">
      <span class="list-row-icon${units <= 2 ? " is-out" : ""}">${iconHtml("package", { weight: "bold" })}</span>
      <span class="list-row-body">
        <span class="list-row-title">Stock</span>
      </span>
      <span class="list-row-amount ops-watch-value">${escapeHtml(phrase)}</span>
    </a>
  `;
}

export function kindBadgeHtml(kind) {
  const map = {
    arrival: ["tx-kind-in", "truck", "ARRIVAGE"],
    sale: ["tx-kind-out", "receipt", "VENTE"],
    customer_payment: ["tx-kind-in", "hand-coins", "PAIEMENT CLIENT"],
    supplier_payment: ["tx-kind-out", "credit-card", "PAIEMENT FOURNISSEUR"],
    expense: ["tx-kind-out", "wallet", "DÉPENSE"],
    adjustment: ["tx-kind-neutral", "package", "STOCK"],
  };
  const [cls, icon, label] = map[kind] || ["tx-kind-in", "dot", kind];
  return `<span class="tx-kind ${cls}">${iconHtml(icon, { weight: "bold", size: "sm" })} ${label}</span>`;
}

export function paymentChipHtml(status) {
  const map = {
    paid: ["status-chip-ok", "Payé"],
    partial: ["status-chip-warn", "Partiel"],
    credit: ["status-chip-info", "À crédit"],
  };
  const [cls, label] = map[status] || ["status-chip-neutral", SETTLEMENT_LABELS[status] || METHOD_LABELS[status] || status];
  return `<span class="status-chip ${cls}">${escapeHtml(label)}</span>`;
}

export function moneyInputHtml(id, name, label, hint) {
  return `
    <div class="field">
      <label class="field-label" for="${id}">${escapeHtml(label)}</label>
      <input id="${id}" name="${name}" class="field-input field-input-amount" inputmode="numeric" autocomplete="off" data-money="true" />
      ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ""}
      <p class="field-error" data-error="${name}" hidden></p>
    </div>
  `;
}
