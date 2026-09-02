/**
 * Pure business financial calculations (integer FCFA / integer quantities).
 */

import { toFcfaInteger } from "./money.js";

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

/**
 * Effective batch cost = merchandise + attributable expenses
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
 * Integer division rounded to nearest FCFA (half up).
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
 * Margin per bag = sale unit price - effective unit cost
 */
export function calculateUnitMargin(saleUnitPrice, effectiveUnitCost) {
  return toFcfaInteger(saleUnitPrice) - toFcfaInteger(effectiveUnitCost);
}

export function isSaleAtLoss(saleUnitPrice, effectiveUnitCost) {
  return calculateUnitMargin(saleUnitPrice, effectiveUnitCost) < 0;
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

export function calculateCogs(quantity, unitCost) {
  return toFcfaInteger(quantity) * toFcfaInteger(unitCost);
}

export function calculateLineMargin(quantity, saleUnitPrice, effectiveUnitCost) {
  return (
    calculateSaleTotal(quantity, saleUnitPrice) -
    calculateCogs(quantity, effectiveUnitCost)
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

export function inferPaymentMethod(total, amountPaid) {
  const t = toFcfaInteger(total);
  const p = toFcfaInteger(amountPaid);
  if (p <= 0) return "credit";
  if (p >= t) return "cash";
  return "partial";
}

/**
 * @param {Array<{ sale_date?: string, payment_date?: string, expense_date?: string, amount_paid_fcfa?: number, amount_fcfa?: number, quantity?: number, sale_unit_price_fcfa?: number, effective_unit_cost_fcfa?: number, is_arrival_cost_allocation?: boolean, kind?: string }>} input
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
    revenue += qty * toFcfaInteger(item.sale_unit_price_fcfa);
    cogs += qty * toFcfaInteger(item.effective_unit_cost_fcfa);
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
    operatingExpenses,
    estimatedProfit: calculateEstimatedProfit({
      revenue,
      cogs,
      operatingExpenses,
    }),
    unitsSold,
  };
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
  if (unitPrice < 0) errors.unitPrice = "Le prix unitaire est invalide.";
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
  if (unitPrice < 0) errors.unitPrice = "Le prix de vente est invalide.";
  if (amountPaid < 0) errors.amountPaid = "Le montant payé est invalide.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";
  if (quantity > 0 && available < quantity) {
    errors.quantity = `Stock insuffisant (${available} disponible${available > 1 ? "s" : ""}).`;
  }

  const total = calculateSaleTotal(quantity, unitPrice);
  if (amountPaid > total) {
    errors.amountPaid = "Le paiement ne peut pas dépasser le total de la vente.";
  }

  const method = input.paymentMethod || inferPaymentMethod(total, amountPaid);
  if (!["cash", "credit", "partial"].includes(method)) {
    errors.paymentMethod = "Mode de paiement invalide.";
  }
  if (method === "exact" || input.repaymentExpectation === "exact") {
    if (!input.repaymentExactDate) {
      errors.repaymentExactDate = "Indiquez la date de remboursement.";
    }
  }
  if (input.repaymentExpectation === "approximate") {
    if (!String(input.repaymentApproxText || "").trim()) {
      errors.repaymentApproxText = "Précisez la période approximative.";
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    quantity,
    unitPrice,
    amountPaid,
    total,
    method,
  };
}

export function validateMoneyPayment(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const amount = toFcfaInteger(input.amount);
  if (amount <= 0) errors.amount = "Le montant doit être supérieur à 0.";
  if (!String(input.date || "").trim()) errors.date = "Indiquez une date.";
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
