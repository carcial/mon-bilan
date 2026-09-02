/**
 * Global history data — reads existing tables, normalizes to HistoryEvent.
 * Does not own Business write workflows. Uses existing read services + bounded queries.
 */

import { getSupabaseOrThrow } from "./client.js";
import { getChurchTransactions, getReconciliations } from "./church.js";
import {
  getArrivals,
  getSales,
  getCustomerPayments,
  getSupplierPayments,
  getExpenses,
  getAdjustments,
  getCustomers,
  getSuppliers,
} from "./business.js";
import { getChurchFunds } from "./church.js";
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

export const HISTORY_SOURCE_LIMIT = 80;
export const HISTORY_PAGE_SIZE = 25;

function dateToIso(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

/**
 * @param {{
 *   from?: string|null,
 *   to?: string|null,
 *   domain?: string,
 *   type?: string,
 *   fundId?: string,
 *   supplierId?: string,
 *   customerId?: string,
 *   search?: string,
 *   offset?: number,
 *   limit?: number,
 * }} filters
 */
export async function getGlobalHistory(filters = {}) {
  const limit = filters.limit || HISTORY_SOURCE_LIMIT;
  const range = { from: filters.from || null, to: filters.to || null };
  const domain = filters.domain || "";

  const churchWanted = !domain || domain === "church";
  const businessWanted = !domain || domain === "business";

  const [churchTx, churchRecon, arrivals, sales, customerPayments, supplierPayments, expenses, adjustments] =
    await Promise.all([
      churchWanted
        ? getChurchTransactions({
            from: range.from,
            to: range.to,
            fundId: filters.fundId || null,
            type:
              filters.type === "income" || filters.type === "expense"
                ? filters.type
                : null,
            limit,
          })
        : [],
      churchWanted ? getReconciliations({ limit }) : [],
      businessWanted
        ? getArrivals({
            from: range.from,
            to: range.to,
            supplierId: filters.supplierId || null,
          }).then((rows) => rows.slice(0, limit))
        : [],
      businessWanted
        ? getSales({
            from: range.from,
            to: range.to,
            customerId: filters.customerId || null,
          }).then((rows) => rows.slice(0, limit))
        : [],
      businessWanted
        ? getCustomerPayments({
            from: range.from,
            to: range.to,
            customerId: filters.customerId || null,
          }).then((rows) => rows.slice(0, limit))
        : [],
      businessWanted
        ? getSupplierPayments({
            from: range.from,
            to: range.to,
            supplierId: filters.supplierId || null,
          }).then((rows) => rows.slice(0, limit))
        : [],
      businessWanted
        ? getExpenses({ from: range.from, to: range.to }).then((rows) =>
            rows.slice(0, limit),
          )
        : [],
      businessWanted ? getAdjustments() : [],
    ]);

  const events = [
    ...churchTx.map(normalizeChurchTransaction),
    ...churchRecon
      .filter((row) => isDateInRange(dateToIso(row.reconciled_at), range.from, range.to))
      .map(normalizeChurchReconciliation),
    ...arrivals.map(normalizeArrival),
    ...sales.map(normalizeSale),
    ...customerPayments.map(normalizeCustomerPayment),
    ...supplierPayments.map(normalizeSupplierPayment),
    ...expenses.map(normalizeBusinessExpense),
    ...adjustments
      .filter((row) => isDateInRange(row.adjustment_date, range.from, range.to))
      .slice(0, limit)
      .map(normalizeAdjustment),
  ];

  const filtered = filterHistoryEvents(sortHistoryEvents(events), {
    from: range.from,
    to: range.to,
    domain: filters.domain,
    type: filters.type,
    fundId: filters.fundId,
    supplierId: filters.supplierId,
    customerId: filters.customerId,
    search: filters.search,
  });

  return paginateHistoryEvents(
    filtered,
    filters.offset || 0,
    filters.pageSize || HISTORY_PAGE_SIZE,
  );
}

export async function getHistoryFilterOptions() {
  const [funds, customers, suppliers] = await Promise.all([
    getChurchFunds().catch(() => []),
    getCustomers().catch(() => []),
    getSuppliers().catch(() => []),
  ]);
  return { funds, customers, suppliers };
}

/**
 * Lightweight existence check — used when Business tables are not yet populated.
 */
export async function historySourcesAvailable() {
  const sb = getSupabaseOrThrow();
  const { error } = await sb.from("church_transactions").select("id").limit(1);
  return !error;
}
