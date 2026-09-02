/**
 * Global report assembly. Church and Business stay financially separate.
 * Never compute Church + Business = total money.
 */

import { calculatePeriodTotals } from "./church-calc.js";
import { calculatePeriodBusinessTotals } from "./business-calc.js";
import { toFcfaInteger } from "./money.js";

/**
 * @param {{
 *   range: { from?: string|null, to?: string|null },
 *   church?: {
 *     transactions?: object[],
 *     endingTotal?: number,
 *     lastReconciliation?: { difference_fcfa?: number, reconciled_at?: string } | null,
 *   },
 *   business?: {
 *     saleItems?: object[],
 *     sales?: object[],
 *     customerPayments?: object[],
 *     expenses?: object[],
 *     receivablesTotal?: number,
 *     payablesTotal?: number,
 *     stockUnits?: number,
 *   },
 * }} input
 */
export function buildGlobalReport(input = {}) {
  const range = input.range || { from: null, to: null };
  const churchTx = input.church?.transactions || [];
  const churchTotals = calculatePeriodTotals(churchTx);
  const lastRecon = input.church?.lastReconciliation || null;

  const business = input.business || {};
  const businessTotals = calculatePeriodBusinessTotals({
    saleItems: business.saleItems || [],
    sales: business.sales || [],
    customerPayments: business.customerPayments || [],
    expenses: business.expenses || [],
  });

  return {
    range,
    church: {
      incomeTotal: churchTotals.incomeTotal,
      expenseTotal: churchTotals.expenseTotal,
      variation: churchTotals.netMovement,
      endingBalance: toFcfaInteger(input.church?.endingTotal ?? 0),
      lastReconciliationDifference: lastRecon
        ? toFcfaInteger(lastRecon.difference_fcfa)
        : null,
      lastReconciliationAt: lastRecon?.reconciled_at || null,
    },
    business: {
      revenue: businessTotals.revenue,
      cashCollected: businessTotals.cashCollected,
      creditIssued: businessTotals.creditIssued,
      cogs: businessTotals.cogs,
      operatingExpenses: businessTotals.operatingExpenses,
      estimatedProfit: businessTotals.estimatedProfit,
      unitsSold: businessTotals.unitsSold,
      receivablesTotal: toFcfaInteger(business.receivablesTotal ?? 0),
      payablesTotal: toFcfaInteger(business.payablesTotal ?? 0),
      stockUnits: toFcfaInteger(business.stockUnits ?? 0),
    },
  };
}

/** Guard used by tests and UI — a combined total must never exist. */
export function hasForbiddenCombinedTotal(report) {
  if (!report || typeof report !== "object") return false;
  const keys = Object.keys(report);
  return keys.some((key) =>
    /grandTotal|combinedTotal|totalMoney|totalPersonnel|churchPlusBusiness/i.test(key),
  );
}
