/**
 * Domain-scoped report adapter. Fetches only the active universe.
 */

import { getChurchReport, getReconciliations } from "./church.js";
import { getBusinessReport, getCustomerPayments } from "./business.js";
import { buildGlobalReport } from "../../utils/global-report.js";

const EMPTY_BUSINESS = {
  saleItems: [],
  sales: [],
  customerPayments: [],
  expenses: [],
  receivablesTotal: 0,
  payablesTotal: 0,
  stockUnits: 0,
};

/**
 * @param {{ from: string|null, to: string|null }} range
 * @param {'church'|'business'} domain
 */
export async function getDomainReport(range, domain) {
  if (domain === "church") {
    const [church, lastRecon] = await Promise.all([
      getChurchReport(range),
      getReconciliations({ limit: 1 }),
    ]);
    return {
      ...buildGlobalReport({
        range,
        church: {
          transactions: church.transactions,
          endingTotal: church.endingTotal,
          lastReconciliation: lastRecon[0] || null,
        },
        business: EMPTY_BUSINESS,
      }),
      churchFunds: church.byFund || [],
    };
  }

  const [business, customerPayments] = await Promise.all([
    getBusinessReport(range),
    getCustomerPayments({ from: range.from, to: range.to }).catch(() => []),
  ]);

  return buildGlobalReport({
    range,
    church: { transactions: [], endingTotal: 0, lastReconciliation: null },
    business: {
      saleItems: (business.sales || []).flatMap((sale) => sale.sale_items || []),
      sales: business.sales || [],
      customerPayments,
      expenses: business.expenses || [],
      receivablesTotal: business.receivablesTotal,
      payablesTotal: business.payablesTotal,
      stockUnits: business.stockUnits,
    },
  });
}

/** @deprecated Use getDomainReport with an explicit domain. */
export async function getGlobalReport(range) {
  return getDomainReport(range, "business");
}
