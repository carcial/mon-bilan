/**
 * Turn audit_events rows into readable French activity cards.
 */

import { formatFcfa } from "./money.js";

const TABLE_LABELS = {
  church_transactions: "Transaction Église",
  church_reconciliations: "Rapprochement Église",
  church_funds: "Caisse",
  stock_arrivals: "Arrivage",
  sales: "Vente",
  sale_items: "Ligne de vente",
  customers: "Client",
  suppliers: "Fournisseur",
  products: "Produit",
  customer_payments: "Paiement client",
  supplier_payments: "Paiement fournisseur",
  business_expenses: "Dépense commerce",
  inventory_adjustments: "Ajustement de stock",
};

const ACTION_LABELS = {
  insert: "ajoutée",
  update: "modifiée",
  delete: "supprimée",
};

const MASCULINE_TABLES = new Set([
  "church_funds",
  "stock_arrivals",
  "customers",
  "suppliers",
  "products",
  "customer_payments",
  "supplier_payments",
]);

function actionWord(table, action) {
  if (action === "insert") return MASCULINE_TABLES.has(table) ? "ajouté" : "ajoutée";
  if (action === "update") return MASCULINE_TABLES.has(table) ? "modifié" : "modifiée";
  if (action === "delete") return MASCULINE_TABLES.has(table) ? "supprimé" : "supprimée";
  return ACTION_LABELS[action] || action;
}

function pickAmount(values) {
  if (!values || typeof values !== "object") return null;
  const keys = [
    "amount_fcfa",
    "amount_paid_fcfa",
    "difference_fcfa",
    "supplier_unit_price_fcfa",
    "sale_unit_price_fcfa",
  ];
  for (const key of keys) {
    if (values[key] != null && values[key] !== "") return Number(values[key]);
  }
  return null;
}

function pickName(values) {
  if (!values || typeof values !== "object") return "";
  return String(values.name || values.reason || values.description || values.code || "").trim();
}

/**
 * @param {{
 *   entity_table?: string,
 *   action?: string,
 *   previous_values?: object|null,
 *   new_values?: object|null,
 *   created_at?: string,
 * }} row
 */
export function formatAuditEvent(row = {}) {
  const table = row.entity_table || "";
  const action = row.action || "";
  const entity = TABLE_LABELS[table] || "Enregistrement";
  const title = `${entity} ${actionWord(table, action)}`;

  const previous = row.previous_values || null;
  const next = row.new_values || null;
  const prevAmount = pickAmount(previous);
  const nextAmount = pickAmount(next);
  const name = pickName(next) || pickName(previous);

  /** @type {string[]} */
  const lines = [];
  if (name) lines.push(name);
  if (action === "update" && prevAmount != null && nextAmount != null && prevAmount !== nextAmount) {
    lines.push(`${formatFcfa(prevAmount)} → ${formatFcfa(nextAmount)}`);
  } else if (nextAmount != null) {
    lines.push(formatFcfa(nextAmount));
  } else if (prevAmount != null) {
    lines.push(formatFcfa(prevAmount));
  }

  return {
    title,
    summary: lines.join(" · ") || entity,
    lines,
    entity,
    action,
    table,
    hasAmountChange:
      action === "update" &&
      prevAmount != null &&
      nextAmount != null &&
      prevAmount !== nextAmount,
    previousAmount: prevAmount,
    newAmount: nextAmount,
    previousValues: previous,
    newValues: next,
  };
}

export function formatAuditDetailPairs(values) {
  if (!values || typeof values !== "object") return [];
  const skip = new Set(["id", "created_at", "updated_at", "fund_id", "customer_id", "supplier_id", "product_id", "arrival_id", "sale_id"]);
  return Object.entries(values)
    .filter(([key, value]) => !skip.has(key) && value != null && value !== "")
    .map(([key, value]) => ({
      label: key.replaceAll("_", " "),
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}
