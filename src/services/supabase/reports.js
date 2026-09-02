/**
 * Global report adapter.
 * Church uses the completed Phase 2 service.
 * Business uses existing Phase 3 read functions when present.
 * After a future Business merge, keep this file as the single integration point.
 */

import { getChurchReport, getReconciliations } from "./church.js";
import { getBusinessReport, getCustomerPayments } from "./business.js";
import { buildGlobalReport } from "../../utils/global-report.js";

/**
 * @param {{ from: string|null, to: string|null }} range
 */
export async function getGlobalReport(range) {
  const [church, lastRecon, business, customerPayments] = await Promise.all([
    getChurchReport(range),
    getReconciliations({ limit: 1 }),
    getBusinessReport(range).catch((err) => {
      console.warn("[reports] business report unavailable", err);
      return null;
    }),
    getCustomerPayments({ from: range.from, to: range.to }).catch(() => []),
  ]);

  return buildGlobalReport({
    range,
    church: {
      transactions: church.transactions,
      endingTotal: church.endingTotal,
      lastReconciliation: lastRecon[0] || null,
    },
    business: business
      ? {
          saleItems: (business.sales || []).flatMap((sale) => sale.sale_items || []),
          sales: business.sales || [],
          customerPayments,
          expenses: business.expenses || [],
          receivablesTotal: business.receivablesTotal,
          payablesTotal: business.payablesTotal,
          stockUnits: business.stockUnits,
        }
      : {
          saleItems: [],
          sales: [],
          customerPayments: [],
          expenses: [],
          receivablesTotal: 0,
          payablesTotal: 0,
          stockUnits: 0,
        },
  });
}
