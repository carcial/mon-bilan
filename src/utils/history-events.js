/**
 * HistoryEvent normalization — frontend-only shape.
 * Never merge Church and Business money. Domain is always explicit.
 */

import { toFcfaInteger } from "./money.js";
import { isDateInRange } from "./periods.js";

export const HISTORY_DOMAINS = {
  church: "church",
  business: "business",
};

export const HISTORY_TYPES = {
  income: "income",
  expense: "expense",
  reconciliation: "reconciliation",
  arrival: "arrival",
  sale: "sale",
  customer_payment: "customer_payment",
  supplier_payment: "supplier_payment",
  business_expense: "business_expense",
  adjustment: "adjustment",
};

export const HISTORY_TYPE_LABELS = {
  income: "Entrée",
  expense: "Sortie",
  reconciliation: "Rapprochement",
  arrival: "Arrivage",
  sale: "Vente",
  customer_payment: "Paiement client",
  supplier_payment: "Paiement fournisseur",
  business_expense: "Dépense",
  adjustment: "Ajustement stock",
};

export const EXPENSE_CATEGORY_LABELS = {
  transport: "Transport",
  unloading: "Déchargement",
  workers: "Employés",
  market_fees: "Frais de marché",
  rent: "Loyer",
  taxes: "Taxes",
  phone: "Téléphone",
  other: "Autre",
};

/**
 * @typedef {object} HistoryEvent
 * @property {string} id
 * @property {'church'|'business'} domain
 * @property {string} type
 * @property {string} date
 * @property {string} title
 * @property {string} subtitle
 * @property {number|null} amount
 * @property {'in'|'out'|'neutral'} direction
 * @property {string} sourceId
 * @property {string} sourceTable
 * @property {string|null} href
 * @property {string} searchText
 * @property {string|null} fundId
 * @property {string|null} supplierId
 * @property {string|null} customerId
 * @property {string} createdAt
 */

export function saleLineTotal(sale) {
  return (sale?.sale_items || []).reduce(
    (sum, item) =>
      sum + toFcfaInteger(item.quantity) * toFcfaInteger(item.sale_unit_price_fcfa),
    0,
  );
}

function eventId(sourceTable, sourceId) {
  return `${sourceTable}:${sourceId}`;
}

function searchBlob(parts) {
  return parts
    .filter((part) => part != null && String(part).trim())
    .map((part) => String(part).toLowerCase())
    .join(" ");
}

export function normalizeChurchTransaction(row) {
  const isExpense = row.transaction_type === "expense";
  const fundName = row.church_funds?.name || "Caisse";
  const reason = row.reason || (isExpense ? "Sortie" : "Entrée");
  return {
    id: eventId("church_transactions", row.id),
    domain: HISTORY_DOMAINS.church,
    type: isExpense ? HISTORY_TYPES.expense : HISTORY_TYPES.income,
    date: row.transaction_date,
    title: reason,
    subtitle: fundName,
    amount: toFcfaInteger(row.amount_fcfa),
    direction: isExpense ? "out" : "in",
    sourceId: row.id,
    sourceTable: "church_transactions",
    href: `/eglise/operation/${row.id}`,
    searchText: searchBlob([reason, row.note, fundName]),
    fundId: row.fund_id || null,
    supplierId: null,
    customerId: null,
    createdAt: row.created_at || row.transaction_date,
  };
}

export function normalizeChurchReconciliation(row) {
  const fundName = row.church_funds?.name || "Toutes les caisses";
  const diff = toFcfaInteger(row.difference_fcfa);
  const date = String(row.reconciled_at || "").slice(0, 10);
  return {
    id: eventId("church_reconciliations", row.id),
    domain: HISTORY_DOMAINS.church,
    type: HISTORY_TYPES.reconciliation,
    date,
    title: "Rapprochement de caisse",
    subtitle: fundName,
    amount: diff,
    direction: diff === 0 ? "neutral" : diff < 0 ? "out" : "in",
    sourceId: row.id,
    sourceTable: "church_reconciliations",
    href: "/eglise/rapprochements",
    searchText: searchBlob(["rapprochement", fundName, row.note]),
    fundId: row.fund_id || null,
    supplierId: null,
    customerId: null,
    createdAt: row.created_at || row.reconciled_at || date,
  };
}

export function normalizeArrival(row) {
  const supplier = row.suppliers?.name || row.suppliers?.code || "Fournisseur";
  const product = row.products?.name || "Produit";
  const qty = toFcfaInteger(row.quantity_received);
  const merchandise = qty * toFcfaInteger(row.supplier_unit_price_fcfa);
  return {
    id: eventId("stock_arrivals", row.id),
    domain: HISTORY_DOMAINS.business,
    type: HISTORY_TYPES.arrival,
    date: row.arrival_date,
    title: "Arrivage",
    subtitle: `${supplier} · ${product} · ${qty}`,
    amount: merchandise,
    direction: "out",
    sourceId: row.id,
    sourceTable: "stock_arrivals",
    href: `/commerce/bordereau/${row.id}`,
    searchText: searchBlob([supplier, product, row.note, "arrivage"]),
    fundId: null,
    supplierId: row.supplier_id || null,
    customerId: null,
    createdAt: row.created_at || row.arrival_date,
  };
}

export function normalizeSale(row) {
  const customer = row.customers?.name || "Client";
  const firstItem = (row.sale_items || [])[0];
  const product = firstItem?.products?.name || "Vente";
  const qty = (row.sale_items || []).reduce(
    (sum, item) => sum + toFcfaInteger(item.quantity),
    0,
  );
  return {
    id: eventId("sales", row.id),
    domain: HISTORY_DOMAINS.business,
    type: HISTORY_TYPES.sale,
    date: row.sale_date,
    title: "Vente",
    subtitle: `${customer} · ${product} · ${qty}`,
    amount: saleLineTotal(row),
    direction: "in",
    sourceId: row.id,
    sourceTable: "sales",
    href: `/commerce/vente/${row.id}`,
    searchText: searchBlob([customer, product, row.note, "vente"]),
    fundId: null,
    supplierId: firstItem?.stock_arrivals?.supplier_id || null,
    customerId: row.customer_id || null,
    createdAt: row.created_at || row.sale_date,
  };
}

export function normalizeCustomerPayment(row) {
  const customer = row.customers?.name || "Client";
  return {
    id: eventId("customer_payments", row.id),
    domain: HISTORY_DOMAINS.business,
    type: HISTORY_TYPES.customer_payment,
    date: row.payment_date,
    title: "Paiement client",
    subtitle: customer,
    amount: toFcfaInteger(row.amount_fcfa),
    direction: "in",
    sourceId: row.id,
    sourceTable: "customer_payments",
    href: row.customer_id ? `/commerce/clients/${row.customer_id}` : "/commerce/a-recevoir",
    searchText: searchBlob([customer, row.note, "paiement"]),
    fundId: null,
    supplierId: null,
    customerId: row.customer_id || null,
    createdAt: row.created_at || row.payment_date,
  };
}

export function normalizeSupplierPayment(row) {
  const supplier = row.suppliers?.name || row.suppliers?.code || "Fournisseur";
  return {
    id: eventId("supplier_payments", row.id),
    domain: HISTORY_DOMAINS.business,
    type: HISTORY_TYPES.supplier_payment,
    date: row.payment_date,
    title: "Paiement fournisseur",
    subtitle: supplier,
    amount: toFcfaInteger(row.amount_fcfa),
    direction: "out",
    sourceId: row.id,
    sourceTable: "supplier_payments",
    href: row.supplier_id ? `/commerce/fournisseurs/${row.supplier_id}` : "/commerce/a-payer",
    searchText: searchBlob([supplier, row.note, "paiement"]),
    fundId: null,
    supplierId: row.supplier_id || null,
    customerId: null,
    createdAt: row.created_at || row.payment_date,
  };
}

export function normalizeBusinessExpense(row) {
  const category = EXPENSE_CATEGORY_LABELS[row.category] || row.category || "Dépense";
  return {
    id: eventId("business_expenses", row.id),
    domain: HISTORY_DOMAINS.business,
    type: HISTORY_TYPES.business_expense,
    date: row.expense_date,
    title: category,
    subtitle: row.description || "Dépense commerce",
    amount: toFcfaInteger(row.amount_fcfa),
    direction: "out",
    sourceId: row.id,
    sourceTable: "business_expenses",
    href: "/commerce/depenses",
    searchText: searchBlob([category, row.description, row.note, "dépense"]),
    fundId: null,
    supplierId: null,
    customerId: null,
    createdAt: row.created_at || row.expense_date,
  };
}

export function normalizeAdjustment(row) {
  const product = row.products?.name || "Stock";
  const qty = toFcfaInteger(row.quantity_delta);
  const signed = qty > 0 ? `+${qty}` : String(qty);
  return {
    id: eventId("inventory_adjustments", row.id),
    domain: HISTORY_DOMAINS.business,
    type: HISTORY_TYPES.adjustment,
    date: row.adjustment_date,
    title: "Ajustement de stock",
    subtitle: `${product} · ${row.reason || "Correction"} · ${signed}`,
    amount: null,
    direction: "neutral",
    sourceId: row.id,
    sourceTable: "inventory_adjustments",
    href: "/commerce/stock",
    searchText: searchBlob([product, row.reason, row.note, "stock"]),
    fundId: null,
    supplierId: null,
    customerId: null,
    createdAt: row.created_at || row.adjustment_date,
  };
}

/**
 * Newest first. Same calendar day uses createdAt, then id.
 * @param {HistoryEvent[]} events
 */
export function sortHistoryEvents(events = []) {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ca = String(a.createdAt || "");
    const cb = String(b.createdAt || "");
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(b.id).localeCompare(String(a.id));
  });
}

/**
 * @param {HistoryEvent[]} events
 * @param {{
 *   from?: string|null,
 *   to?: string|null,
 *   domain?: string,
 *   type?: string,
 *   fundId?: string,
 *   supplierId?: string,
 *   customerId?: string,
 *   search?: string,
 * }} filters
 */
export function filterHistoryEvents(events = [], filters = {}) {
  const domain = filters.domain || "";
  const type = filters.type || "";
  const fundId = filters.fundId || "";
  const supplierId = filters.supplierId || "";
  const customerId = filters.customerId || "";
  const search = String(filters.search || "")
    .trim()
    .toLowerCase();

  return events.filter((event) => {
    if (!isDateInRange(event.date, filters.from || null, filters.to || null)) {
      return false;
    }
    if (domain && event.domain !== domain) return false;
    if (type && event.type !== type) return false;
    if (fundId && event.fundId !== fundId) return false;
    if (supplierId && event.supplierId !== supplierId) return false;
    if (customerId && event.customerId !== customerId) return false;
    if (search && !event.searchText.includes(search)) return false;
    return true;
  });
}

export function paginateHistoryEvents(events = [], offset = 0, limit = 25) {
  const start = Math.max(0, offset);
  const slice = events.slice(start, start + limit);
  return {
    items: slice,
    offset: start,
    limit,
    total: events.length,
    hasMore: start + slice.length < events.length,
  };
}
