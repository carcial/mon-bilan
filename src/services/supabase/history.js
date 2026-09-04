/**
 * Domain-scoped history. Queries only the active universe.
 */

import { getChurchFunds, getChurchTransactions, getReconciliations } from "./church.js";
import {
  getAdjustments,
  getArrivals,
  getCustomerPayments,
  getCustomers,
  getExpenses,
  getProducts,
  getSales,
  getSupplierPayments,
  getSuppliers,
} from "./business.js";
import {
  filterHistoryEvents,
  normalizeAdjustment,
  normalizeArrival,
  normalizeBusinessExpense,
  normalizeChurchReconciliation,
  normalizeChurchTransaction,
  normalizeCustomerPayment,
  normalizeSale,
  normalizeSupplierPayment,
  paginateHistoryEvents,
  sortHistoryEvents,
} from "../../utils/history-events.js";
import { isDateInRange } from "../../utils/periods.js";

export const HISTORY_PAGE_SIZE = 15;

function dateToIso(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function requireDomain(domain) {
  return domain === "church" ? "church" : "business";
}

/**
 * @param {{
 *   domain: 'church'|'business',
 *   from?: string|null,
 *   to?: string|null,
 *   type?: string,
 *   fundId?: string,
 *   supplierId?: string,
 *   customerId?: string,
 *   productId?: string,
 *   search?: string,
 *   offset?: number,
 *   pageSize?: number,
 *   limit?: number,
 * }} filters
 */
export async function getGlobalHistory(filters = {}) {
  const domain = requireDomain(filters.domain);
  const pageSize = filters.pageSize || HISTORY_PAGE_SIZE;
  const offset = filters.offset || 0;
  const range = { from: filters.from || null, to: filters.to || null };

  const events =
    domain === "church"
      ? await fetchChurchEvents(range, filters)
      : await fetchBusinessEvents(range, filters);

  const filtered = filterHistoryEvents(sortHistoryEvents(events), {
    from: range.from,
    to: range.to,
    domain,
    type: filters.type,
    fundId: filters.fundId,
    supplierId: filters.supplierId,
    customerId: filters.customerId,
    productId: filters.productId,
    search: filters.search,
  });

  return paginateHistoryEvents(filtered, offset, pageSize);
}

async function fetchChurchEvents(range, filters) {
  const [churchTx, churchRecon] = await Promise.all([
    getChurchTransactions({
      from: range.from,
      to: range.to,
      fundId: filters.fundId || null,
      type: filters.type === "income" || filters.type === "expense" ? filters.type : null,
    }),
    getReconciliations({}),
  ]);

  return [
    ...churchTx.map(normalizeChurchTransaction),
    ...churchRecon
      .filter((row) => isDateInRange(dateToIso(row.reconciled_at), range.from, range.to))
      .map(normalizeChurchReconciliation),
  ];
}

async function fetchBusinessEvents(range, filters) {
  const [arrivals, sales, customerPayments, supplierPayments, expenses, adjustments] =
    await Promise.all([
      getArrivals({
        from: range.from,
        to: range.to,
        supplierId: filters.supplierId || null,
      }),
      getSales({
        from: range.from,
        to: range.to,
        customerId: filters.customerId || null,
      }),
      getCustomerPayments({
        from: range.from,
        to: range.to,
        customerId: filters.customerId || null,
      }),
      getSupplierPayments({
        from: range.from,
        to: range.to,
        supplierId: filters.supplierId || null,
      }),
      getExpenses({ from: range.from, to: range.to }),
      getAdjustments({ productId: filters.productId || null }),
    ]);

  return [
    ...arrivals.map(normalizeArrival),
    ...sales.map(normalizeSale),
    ...customerPayments.map(normalizeCustomerPayment),
    ...supplierPayments.map(normalizeSupplierPayment),
    ...expenses.map(normalizeBusinessExpense),
    ...adjustments
      .filter((row) => isDateInRange(row.adjustment_date, range.from, range.to))
      .map(normalizeAdjustment),
  ];
}

export async function getHistoryFilterOptions(domain) {
  const resolved = requireDomain(domain);
  if (resolved === "church") {
    const funds = await getChurchFunds().catch(() => []);
    return { funds, customers: [], suppliers: [], products: [] };
  }
  const [customers, suppliers, products] = await Promise.all([
    getCustomers().catch(() => []),
    getSuppliers().catch(() => []),
    getProducts().catch(() => []),
  ]);
  return { funds: [], customers, suppliers, products };
}
