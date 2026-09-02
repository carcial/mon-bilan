import { formatFcfa } from "../../utils/money.js";
import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";

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
  payables: "/commerce/a-payer",
  history: "/commerce/historique",
  report: "/commerce/rapport",
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

export const PAYMENT_LABELS = {
  cash: "Espèces",
  credit: "Crédit",
  partial: "Paiement partiel",
};

export function backLinkHtml(href, label = "Retour") {
  return `
    <a class="back-link" href="#${href}">
      <span aria-hidden="true">←</span> ${escapeHtml(label)}
    </a>
  `;
}

export function pageHeaderHtml({ kicker = "Commerce", title, subtitle, backHref, backLabel }) {
  return `
    <header class="page-header">
      ${backHref ? backLinkHtml(backHref, backLabel || "Retour au commerce") : ""}
      ${kicker ? `<p class="page-kicker">${escapeHtml(kicker)}</p>` : ""}
      <h1 class="page-title" id="business-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </header>
  `;
}

export function skeletonHtml(lines = 3) {
  const items = Array.from({ length: lines }, (_, i) => {
    const wide = i === 0 ? " skeleton-line-lg" : "";
    return `<div class="skeleton-line${wide}"></div>`;
  }).join("");
  return `<div class="card skeleton-card" aria-hidden="true">${items}</div>`;
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

export function kindBadgeHtml(kind) {
  const map = {
    arrival: ["tx-kind-in", "↑", "ARRIVAGE"],
    sale: ["tx-kind-out", "↓", "VENTE"],
    customer_payment: ["tx-kind-in", "↑", "PAIEMENT CLIENT"],
    supplier_payment: ["tx-kind-out", "↓", "PAIEMENT FOURNISSEUR"],
    expense: ["tx-kind-out", "↓", "DÉPENSE"],
    adjustment: ["tx-kind-out", "±", "STOCK"],
  };
  const [cls, icon, label] = map[kind] || ["tx-kind-in", "•", kind];
  return `<span class="tx-kind ${cls}"><span aria-hidden="true">${icon}</span> ${label}</span>`;
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
