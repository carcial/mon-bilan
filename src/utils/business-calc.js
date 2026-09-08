/**
 * Pure business financial calculations (integer FCFA / integer quantities).
 */

import { MAX_FCFA_INPUT, toFcfaInteger } from "./money.js";

/**
 * Supplier merchandise amount = quantity × amount the supplier expects per bag.
 * This is NOT an effective/blended cost after transport.
 */
export function calculateMerchandiseValue(quantity, unitPrice) {
  const q = toFcfaInteger(quantity);
  const p = toFcfaInteger(unitPrice);
  return q * p;
}

export function calculateArrivalExpenses({
  transport = 0,
  unloading = 0,
  other = 0,
}) {
  return (
    toFcfaInteger(transport) +
    toFcfaInteger(unloading) +
    toFcfaInteger(other)
  );
}

export function arrivalFeeInclusionLabel({
  transport = 0,
  unloading = 0,
  other = 0,
} = {}) {
  const parts = [];
  if (toFcfaInteger(transport) > 0) parts.push("transport");
  if (toFcfaInteger(unloading) > 0) parts.push("déchargement");
  if (toFcfaInteger(other) > 0) parts.push("autres frais");
  if (!parts.length) return "";
  if (parts.length === 1) return `inclut ${parts[0]}`;
  if (parts.length === 2) return `inclut ${parts[0]} + ${parts[1]}`;
  return `inclut ${parts[0]} + ${parts[1]} + ${parts[2]}`;
}

/**
 * User-facing arrival totals. Supplier per-bag amount stays unchanged;
 * fees are shown separately; total engaged = merchandise + fees.
 */
export function summarizeArrivalEngagement({
  quantity,
  unitPrice,
  transport = 0,
  unloading = 0,
  other = 0,
} = {}) {
  const qty = toFcfaInteger(quantity);
  const supplierAmountPerUnit = toFcfaInteger(unitPrice);
  const merchandise = calculateMerchandiseValue(qty, supplierAmountPerUnit);
  const fees = calculateArrivalExpenses({ transport, unloading, other });
  return {
    quantity: qty,
    supplierAmountPerUnit,
    merchandise,
    fees,
    totalEngaged: merchandise + fees,
    feeLabel: arrivalFeeInclusionLabel({ transport, unloading, other }),
  };
}

/**
 * Internal trader cost for the batch (merchandise + fees).
 * Do not present this as the supplier's requested amount.
 */
export function calculateEffectiveBatchCost({
  quantity,
  unitPrice,
  transport = 0,
  unloading = 0,
  other = 0,
}) {
  const merchandise = calculateMerchandiseValue(quantity, unitPrice);
  const expenses = calculateArrivalExpenses({ transport, unloading, other });
  return merchandise + expenses;
}

/**
 * Internal trader cost per unit: (merchandise + fees) / quantity.
 * Rounding rule (positive integers only): nearest FCFA, halves round up
 *   floor((cost + floor(q / 2)) / q)
 * Example: 795 000 / 30 = 26 500 exactly; 3 / 2 → 2.
 * Do not present this as the supplier's requested per-bag amount.
 * Do not use this for displayed sale margin.
 * Returns null if quantity is 0.
 */
export function calculateEffectiveUnitCost(batchCost, quantity) {
  const q = toFcfaInteger(quantity);
  if (q <= 0) return null;
  const cost = toFcfaInteger(batchCost);
  return Math.floor((cost + Math.floor(q / 2)) / q);
}

export function calculateSaleTotal(quantity, unitPrice) {
  return calculateMerchandiseValue(quantity, unitPrice);
}

/**
 * @returns {{ total: number, paid: number, remaining: number }}
 */
export function calculateSaleReceivable({ quantity, unitPrice, amountPaid = 0 }) {
  const total = calculateSaleTotal(quantity, unitPrice);
  const paid = toFcfaInteger(amountPaid);
  const remaining = Math.max(0, total - paid);
  return { total, paid, remaining };
}

/**
 * Canonical supplier expected amount per bag for a sale line.
 * Reads `supplier_unit_price_fcfa` on the item or its arrival.
 * Never falls back to effective/blended unit cost (that was the 8 000 vs 12 000 bug).
 */
export function supplierUnitPriceFromSaleItem(item) {
  if (!item) return 0;
  if (item.supplier_unit_price_fcfa != null && item.supplier_unit_price_fcfa !== "") {
    return toFcfaInteger(item.supplier_unit_price_fcfa);
  }
  const nested = item.stock_arrivals?.supplier_unit_price_fcfa;
  if (nested != null && nested !== "") return toFcfaInteger(nested);
  return 0;
}

/**
 * Simple product margin per bag (canonical for UI / dashboard / reports / Excel):
 *   unit margin = selling price − supplier expected amount per bag
 * Transport / unloading / other fees are NOT subtracted here.
 */
export function calculateUnitMargin(saleUnitPrice, supplierAmountPerUnit) {
  return toFcfaInteger(saleUnitPrice) - toFcfaInteger(supplierAmountPerUnit);
}

/** Sale is at a loss vs supplier amount when selling price < supplier expected amount. */
export function isSaleAtLoss(saleUnitPrice, supplierAmountPerUnit) {
  return calculateUnitMargin(saleUnitPrice, supplierAmountPerUnit) < 0;
}

/**
 * Supplier outstanding for one arrival:
 * merchandise value - advance - payments (transport not automatic debt)
 */
export function calculateSupplierObligationBase({
  merchandiseValue,
  arrivalExpenses = 0,
  expensesOwedToSupplier = false,
}) {
  const merchandise = toFcfaInteger(merchandiseValue);
  if (!expensesOwedToSupplier) return merchandise;
  return merchandise + toFcfaInteger(arrivalExpenses);
}

/**
 * Supplier outstanding for one arrival:
 * merchandise value - advance - payments (transport not automatic debt
 * unless expensesOwedToSupplier is true).
 */
export function calculateSupplierOutstanding({
  merchandiseValue,
  advancePaid = 0,
  paymentsTotal = 0,
  arrivalExpenses = 0,
  expensesOwedToSupplier = false,
}) {
  const base = calculateSupplierObligationBase({
    merchandiseValue,
    arrivalExpenses,
    expensesOwedToSupplier,
  });
  return Math.max(
    0,
    base - toFcfaInteger(advancePaid) - toFcfaInteger(paymentsTotal),
  );
}

/**
 * available ≈ received - sold - adjustments(losses positive reduction)
 * adjustmentsDelta is signed: negative = loss/damage, positive = correction add
 */
export function calculateAvailableInventory({
  received = 0,
  sold = 0,
  adjustmentsDelta = 0,
}) {
  return (
    toFcfaInteger(received) -
    toFcfaInteger(sold) +
    toFcfaInteger(adjustmentsDelta)
  );
}

/** Sum actual available quantity from product_inventory rows (not row/batch count). */
export function sumAvailableInventory(inventory = []) {
  return (inventory || []).reduce(
    (sum, row) => sum + toFcfaInteger(row?.quantity_available),
    0,
  );
}

export function canSellQuantity(available, requested) {
  return toFcfaInteger(requested) > 0 && toFcfaInteger(requested) <= toFcfaInteger(available);
}

export function applyCustomerPayment(owed, paymentAmount) {
  const o = toFcfaInteger(owed);
  const p = toFcfaInteger(paymentAmount);
  const applied = Math.min(o, p);
  return {
    applied,
    remaining: Math.max(0, o - applied),
    excess: Math.max(0, p - o),
  };
}

/** Generic qty × unit amount (integer). Prefer named helpers at call sites. */
export function calculateCogs(quantity, unitAmount) {
  return calculateMerchandiseValue(quantity, unitAmount);
}

/**
 * Canonical sale-line margin:
 *   (quantity × selling price) − (quantity × supplier expected amount)
 */
export function calculateLineMargin(quantity, saleUnitPrice, supplierAmountPerUnit) {
  return (
    calculateSaleTotal(quantity, saleUnitPrice) -
    calculateMerchandiseValue(quantity, supplierAmountPerUnit)
  );
}

export function calculateOperatingExpenses(expenses = []) {
  return expenses.reduce((sum, row) => {
    if (row.is_arrival_cost_allocation) return sum;
    return sum + toFcfaInteger(row.amount_fcfa ?? row.amount);
  }, 0);
}

export function calculateEstimatedProfit({
  revenue = 0,
  cogs = 0,
  operatingExpenses = 0,
}) {
  return (
    toFcfaInteger(revenue) -
    toFcfaInteger(cogs) -
    toFcfaInteger(operatingExpenses)
  );
}

export function calculateCustomerOutstanding({
  purchases = 0,
  paidAtSale = 0,
  payments = 0,
}) {
  return Math.max(
    0,
    toFcfaInteger(purchases) - toFcfaInteger(paidAtSale) - toFcfaInteger(payments),
  );
}

export const SETTLEMENT_STATUSES = ["paid", "partial", "credit"];
export const PAYMENT_METHODS = ["cash", "mobile_money", "bank"];

export function inferSettlementStatus(total, amountPaid) {
  const t = toFcfaInteger(total);
  const p = toFcfaInteger(amountPaid);
  if (p <= 0) return "credit";
  if (p >= t) return "paid";
  return "partial";
}

/** @deprecated Use inferSettlementStatus. Kept only for older tests/callers. */
export function inferPaymentMethod(total, amountPaid) {
  return inferSettlementStatus(total, amountPaid);
}

export function paidNowForSettlement(status, total, amountPaid = 0) {
  if (status === "paid") return toFcfaInteger(total);
  if (status === "credit") return 0;
  return toFcfaInteger(amountPaid);
}

export function saleItemsTotal(sale) {
  return (sale?.sale_items || []).reduce(
    (sum, item) => sum + toFcfaInteger(item.quantity) * toFcfaInteger(item.sale_unit_price_fcfa),
    0,
  );
}

/** Unique identifiable customers on sales. Ignores rows with no customer_id. */
export function uniqueKnownCustomerCount(sales = []) {
  const ids = new Set(
    (sales || []).map((sale) => sale.customer_id).filter((id) => Boolean(id)),
  );
  return ids.size;
}

/**
 * Remaining per sale after sale-time payment, linked later payments, then unallocated FIFO.
 * Rule: oldest outstanding sale first.
 */
export function computeSaleRemainders(sales = [], payments = []) {
  const rows = [...(sales || [])]
    .sort((a, b) => {
      const dateCmp = String(a.sale_date || "").localeCompare(String(b.sale_date || ""));
      if (dateCmp !== 0) return dateCmp;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    })
    .map((sale) => {
      const total = saleItemsTotal(sale);
      const linked = (payments || [])
        .filter((p) => p.sale_id === sale.id)
        .reduce((sum, p) => sum + toFcfaInteger(p.amount_fcfa), 0);
      return {
        saleId: sale.id,
        saleDate: sale.sale_date,
        createdAt: sale.created_at,
        total,
        remaining: Math.max(0, total - toFcfaInteger(sale.amount_paid_fcfa) - linked),
        sale,
      };
    });

  let unallocated = (payments || [])
    .filter((p) => !p.sale_id)
    .reduce((sum, p) => sum + toFcfaInteger(p.amount_fcfa), 0);
  for (const row of rows) {
    if (unallocated <= 0) break;
    const applied = Math.min(row.remaining, unallocated);
    row.remaining -= applied;
    unallocated -= applied;
  }
  return rows;
}

/** Sum of remaining balances after FIFO — must equal calculateCustomerOutstanding. */
export function sumRemainderOutstanding(remainders = []) {
  return (remainders || []).reduce(
    (sum, row) => sum + toFcfaInteger(row.remaining),
    0,
  );
}

export function allocatePaymentFifo(remainders = [], amount) {
  const leftStart = toFcfaInteger(amount);
  let left = leftStart;
  const allocations = [];
  for (const row of remainders || []) {
    if (left <= 0) break;
    const open = toFcfaInteger(row.remaining);
    if (open <= 0) continue;
    const applied = Math.min(open, left);
    allocations.push({ saleId: row.saleId || null, amount: applied });
    left -= applied;
  }
  return { allocations, leftover: left, allocated: leftStart - left };
}

export function formatDueExpectation(sale) {
  const kind = sale?.repayment_expectation || "undetermined";
  if (kind === "exact" && sale?.repayment_exact_date) return { kind, label: "exact", date: sale.repayment_exact_date, text: null };
  if (kind === "approximate" && sale?.repayment_approx_text) {
    return { kind, label: "approximate", date: null, text: String(sale.repayment_approx_text).trim() };
  }
  return { kind: "undetermined", label: "undetermined", date: null, text: null };
}

/**
 * Period P&L. `cogs` is supplier merchandise for sold quantity
 * (qty × supplier expected amount), not blended arrival cost.
 * Arrival fees stay on the arrival (total engagé) and are excluded from opex
 * when marked `is_arrival_cost_allocation`.
 *
 * estimatedProfit = revenue − supplier merchandise sold − operating expenses
 * This is not cash flow. creditIssued = revenue − paid at sale (later payments
 * do not reduce credit issued).
 */
export function calculatePeriodBusinessTotals({
  saleItems = [],
  sales = [],
  customerPayments = [],
  expenses = [],
} = {}) {
  let revenue = 0;
  let cogs = 0;
  let unitsSold = 0;
  for (const item of saleItems) {
    const qty = toFcfaInteger(item.quantity);
    revenue += calculateSaleTotal(qty, item.sale_unit_price_fcfa);
    cogs += calculateMerchandiseValue(qty, supplierUnitPriceFromSaleItem(item));
    unitsSold += qty;
  }

  const paidAtSale = sales.reduce(
    (sum, sale) => sum + toFcfaInteger(sale.amount_paid_fcfa),
    0,
  );
  const laterPayments = customerPayments.reduce(
    (sum, row) => sum + toFcfaInteger(row.amount_fcfa),
    0,
  );
  const cashCollected = paidAtSale + laterPayments;
  const creditIssued = Math.max(0, revenue - paidAtSale);
  const operatingExpenses = calculateOperatingExpenses(expenses);

  return {
    revenue,
    cashCollected,
    creditIssued,
    cogs,
    grossMargin: toFcfaInteger(revenue) - toFcfaInteger(cogs),
    operatingExpenses,
    estimatedProfit: calculateEstimatedProfit({
      revenue,
      cogs,
      operatingExpenses,
    }),
    unitsSold,
  };
}

/** Canonical sources of customer cash. Sale-time paid-now is NOT copied into customer_payments. */
export const CUSTOMER_CASH_SOURCE = {
  atSale: "at_sale",
  later: "later",
};

/**
 * Unified customer money-in events. Each franc appears once:
 * sales.amount_paid_fcfa (paid at sale) + customer_payments (later).
 * Newest first.
 */
export function customerCashEvents({ sales = [], payments = [] } = {}) {
  const fromSales = (sales || [])
    .filter((sale) => toFcfaInteger(sale.amount_paid_fcfa) > 0)
    .map((sale) => ({
      id: `sale:${sale.id}`,
      source: CUSTOMER_CASH_SOURCE.atSale,
      amount_fcfa: toFcfaInteger(sale.amount_paid_fcfa),
      payment_date: sale.sale_date,
      created_at: sale.created_at || sale.sale_date,
      customer_id: sale.customer_id,
      payment_method: sale.payment_method,
      sale_id: sale.id,
      note: sale.note || null,
      customers: sale.customers || null,
    }));
  const fromPayments = (payments || []).map((row) => ({
    id: row.id,
    source: CUSTOMER_CASH_SOURCE.later,
    amount_fcfa: toFcfaInteger(row.amount_fcfa),
    payment_date: row.payment_date,
    created_at: row.created_at || row.payment_date,
    customer_id: row.customer_id,
    payment_method: row.payment_method,
    sale_id: row.sale_id,
    note: row.note || null,
    customers: row.customers || null,
  }));
  return [...fromSales, ...fromPayments].sort((a, b) => {
    if (a.payment_date !== b.payment_date) return a.payment_date < b.payment_date ? 1 : -1;
    const ca = String(a.created_at || "");
    const cb = String(b.created_at || "");
    if (ca !== cb) return cb.localeCompare(ca);
    return String(b.id).localeCompare(String(a.id));
  });
}

export function cashReceivedOnDate(events = [], dateIso) {
  return (events || [])
    .filter((row) => row.payment_date === dateIso)
    .reduce((sum, row) => sum + toFcfaInteger(row.amount_fcfa), 0);
}

export function latestCustomerCashEvent(events = []) {
  return events[0] || null;
}

export function validateArrival(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const quantity = toFcfaInteger(input.quantity);
  const unitPrice = toFcfaInteger(input.unitPrice);
  const transport = toFcfaInteger(input.transport);
  const unloading = toFcfaInteger(input.unloading);
  const other = toFcfaInteger(input.other);
  const advance = toFcfaInteger(input.advance);

  if (!String(input.supplierId || "").trim()) {
    errors.supplierId = "Choisissez un fournisseur.";
  }
  if (!String(input.productId || "").trim()) {
    errors.productId = "Choisissez un produit.";
  }
  if (quantity <= 0) errors.quantity = "La quantité doit être supérieure à 0.";
  if (quantity > 1_000_000) errors.quantity = "La quantité est trop grande.";
  if (unitPrice < 0) errors.unitPrice = "Le prix unitaire est invalide.";
  if (unitPrice > MAX_FCFA_INPUT) errors.unitPrice = "Le montant est trop grand.";
  if (transport < 0) errors.transport = "Le transport est invalide.";
  if (unloading < 0) errors.unloading = "Le déchargement est invalide.";
  if (other < 0) errors.other = "Les autres frais sont invalides.";
  if (advance < 0) errors.advance = "L'avance est invalide.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    quantity,
    unitPrice,
    transport,
    unloading,
    other,
    advance,
  };
}

export function validateSale(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const quantity = toFcfaInteger(input.quantity);
  const unitPrice = toFcfaInteger(input.unitPrice);
  const amountPaid = toFcfaInteger(input.amountPaid);
  const available = toFcfaInteger(input.available);

  if (!String(input.customerId || "").trim() && !String(input.newCustomerName || "").trim()) {
    errors.customerId = "Choisissez ou créez un client.";
  }
  if (!String(input.productId || "").trim()) {
    errors.productId = "Choisissez un produit.";
  }
  if (!String(input.arrivalId || "").trim()) {
    errors.arrivalId = "Choisissez un bordereau en stock.";
  }
  if (quantity <= 0) errors.quantity = "La quantité doit être supérieure à 0.";
  if (quantity > 1_000_000) errors.quantity = "La quantité est trop grande.";
  if (unitPrice < 0) errors.unitPrice = "Le prix de vente est invalide.";
  if (unitPrice > MAX_FCFA_INPUT) errors.unitPrice = "Le montant est trop grand.";
  if (amountPaid < 0) errors.amountPaid = "Le montant payé est invalide.";
  if (amountPaid > MAX_FCFA_INPUT) errors.amountPaid = "Le montant est trop grand.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";
  if (quantity > 0 && available < quantity) {
    errors.quantity = `Stock insuffisant (${available} disponible${available > 1 ? "s" : ""}).`;
  }

  const total = calculateSaleTotal(quantity, unitPrice);
  const settlement = SETTLEMENT_STATUSES.includes(input.settlementStatus)
    ? input.settlementStatus
    : inferSettlementStatus(total, amountPaid);
  const paidNow = paidNowForSettlement(settlement, total, amountPaid);

  if (settlement === "partial") {
    if (paidNow <= 0) errors.amountPaid = "Indiquez le montant payé maintenant.";
    if (paidNow >= total && total > 0) {
      errors.amountPaid = "Pour un paiement partiel, le montant doit être inférieur au total.";
    }
  }
  if (paidNow > total) {
    errors.amountPaid = "Le paiement ne peut pas dépasser le total de la vente.";
  }

  const method = input.paymentMethod || "";
  if (settlement === "credit") {
    // no instrument yet
  } else if (!PAYMENT_METHODS.includes(method)) {
    errors.paymentMethod = "Choisissez le mode de paiement.";
  }

  if (settlement !== "paid") {
    if (input.repaymentExpectation === "exact" && !input.repaymentExactDate) {
      errors.repaymentExactDate = "Indiquez la date prévue.";
    }
    if (input.repaymentExpectation === "approximate" && !String(input.repaymentApproxText || "").trim()) {
      errors.repaymentApproxText = "Précisez la période approximative.";
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    quantity,
    unitPrice,
    amountPaid: paidNow,
    total,
    settlement,
    method: settlement === "credit" ? null : method || null,
  };
}

export function validateMoneyPayment(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const amount = toFcfaInteger(input.amount);
  const outstanding = input.outstanding == null ? null : toFcfaInteger(input.outstanding);
  if (amount <= 0) errors.amount = "Le montant doit être supérieur à 0.";
  if (amount > MAX_FCFA_INPUT) errors.amount = "Le montant est trop grand.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";
  if (input.requireMethod !== false && !PAYMENT_METHODS.includes(input.paymentMethod)) {
    errors.paymentMethod = "Choisissez le mode de paiement.";
  }
  if (outstanding != null && amount > outstanding) {
    errors.amount = "Le montant dépasse la somme due.";
  }
  return { ok: Object.keys(errors).length === 0, errors, amount };
}

export function validateExpense(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const amount = toFcfaInteger(input.amount);
  const categories = [
    "transport",
    "unloading",
    "workers",
    "market_fees",
    "rent",
    "taxes",
    "phone",
    "other",
  ];
  if (!categories.includes(input.category)) {
    errors.category = "Choisissez une catégorie.";
  }
  if (amount <= 0) errors.amount = "Le montant doit être supérieur à 0.";
  if (amount > MAX_FCFA_INPUT) errors.amount = "Le montant est trop grand.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";
  if (!String(input.description || "").trim()) {
    errors.description = "Indiquez le motif.";
  }
  return { ok: Object.keys(errors).length === 0, errors, amount };
}

export function validateAdjustment(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const quantity = Math.abs(toFcfaInteger(input.quantity));
  if (!String(input.productId || "").trim()) {
    errors.productId = "Choisissez un produit.";
  }
  if (quantity <= 0) errors.quantity = "La quantité doit être supérieure à 0.";
  if (!String(input.reason || "").trim()) errors.reason = "Indiquez le motif.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";
  if (!["remove", "add"].includes(input.direction || "remove")) {
    errors.direction = "Choisissez le type d'ajustement.";
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    quantity,
    delta: (input.direction || "remove") === "add" ? quantity : -quantity,
  };
}
