/**
 * Domain-scoped Excel export. Fetches only the active universe.
 * Numbers come from getBusinessReport / getChurchReport — never recomputed here.
 */

import { getChurchReport, getReconciliations } from "./church.js";
import {
  getArrivalInventory,
  getArrivals,
  getBusinessReport,
  getCustomerPayments,
  getCustomers,
  getExpenses,
  getSupplierPayments,
  getSuppliers,
} from "./business.js";
import { displayDateFr } from "../../utils/dates.js";
import {
  annotatePaymentRunningBalances,
  paymentMethodLabel,
  shortRef,
} from "../../utils/excel-export-map.js";
import { buildExcelWorkbookData } from "../../utils/excel-workbook.js";
import {
  EXPENSE_CATEGORY_LABELS,
  HISTORY_TYPE_LABELS,
  normalizeChurchReconciliation,
  normalizeChurchTransaction,
  sortHistoryEvents,
} from "../../utils/history-events.js";
import { isDateInRange } from "../../utils/periods.js";
import { supplierDisplayLabel } from "../../utils/supplier-label.js";

/**
 * @param {{
 *   from: string|null,
 *   to: string|null,
 *   periodLabel: string,
 *   period?: string,
 *   domain?: 'church'|'business',
 * }} range
 */
export async function getExcelExportData(range) {
  const domain = range.domain === "church" ? "church" : "business";
  const generatedAt = displayDateFr(new Date());
  const periodKind = range.period || "";

  if (domain === "church") {
    return getChurchExportData(range, generatedAt, periodKind);
  }
  return getBusinessExportData(range, generatedAt, periodKind);
}

async function getChurchExportData(range, generatedAt, periodKind) {
  const [church, reconciliations] = await Promise.all([
    getChurchReport(range),
    getReconciliations({}),
  ]);

  const churchIncome = (church.transactions || []).filter(
    (row) => row.transaction_type === "income",
  );
  const churchExpense = (church.transactions || []).filter(
    (row) => row.transaction_type === "expense",
  );
  const periodRecons = (reconciliations || []).filter((row) => {
    const day = String(row.reconciled_at || "").slice(0, 10);
    return isDateInRange(day, range.from, range.to);
  });

  const byFund = church.byFund || [];
  const churchFunds = byFund.map((row) => ({
    id: row.fund?.id,
    name: row.fund?.name,
    code: row.fund?.code,
    opening_balance_fcfa: row.fund?.opening_balance_fcfa,
    incomeTotal: row.incomeTotal,
    expenseTotal: row.expenseTotal,
    endingBalance: row.endingBalance,
  }));

  const history = sortHistoryEvents([
    ...churchIncome.map((row) => ({
      ...normalizeChurchTransaction(row),
      note: row.note,
      reference: shortRef(row.id),
    })),
    ...churchExpense.map((row) => ({
      ...normalizeChurchTransaction(row),
      note: row.note,
      reference: shortRef(row.id),
    })),
    ...periodRecons.map((row) => ({
      ...normalizeChurchReconciliation(row),
      note: row.note,
      reference: shortRef(row.id),
    })),
  ]);

  return buildExcelWorkbookData(
    {
      periodLabel: range.periodLabel || "",
      periodKind,
      range,
      generatedAt,
      church: {
        incomeTotal: church.totals.incomeTotal,
        expenseTotal: church.totals.expenseTotal,
        variation: church.totals.netMovement,
        endingBalance: church.endingTotal,
        lastReconciliationDifference: reconciliations[0]
          ? reconciliations[0].difference_fcfa
          : null,
        byFund,
      },
      churchIncome: churchIncome.map((row) => ({
        ...row,
        reference: shortRef(row.id),
      })),
      churchExpense: churchExpense.map((row) => ({
        ...row,
        reference: shortRef(row.id),
      })),
      churchFunds,
      churchReconciliations: periodRecons.map((row) => ({
        ...row,
        reference: shortRef(row.id),
      })),
      churchHistory: history.map((row) => ({
        ...row,
        typeLabel: HISTORY_TYPE_LABELS[row.type] || row.type,
      })),
    },
    "church",
  );
}

async function getBusinessExportData(range, generatedAt, periodKind) {
  const [
    business,
    arrivals,
    allArrivals,
    expenses,
    periodCustomerPayments,
    allCustomerPayments,
    periodSupplierPayments,
    allSupplierPayments,
    customers,
    suppliers,
    arrivalInventory,
  ] = await Promise.all([
    getBusinessReport(range),
    getArrivals({ from: range.from, to: range.to }),
    getArrivals(),
    getExpenses({ from: range.from, to: range.to }),
    getCustomerPayments({ from: range.from, to: range.to }),
    getCustomerPayments(),
    getSupplierPayments({ from: range.from, to: range.to }),
    getSupplierPayments(),
    getCustomers(),
    getSuppliers(),
    getArrivalInventory(),
  ]);

  const remainderBySaleId = new Map();
  for (const row of business.receivables || []) {
    for (const rem of row.remainders || []) {
      remainderBySaleId.set(rem.saleId, rem.remaining);
    }
  }

  const allSales = (business.receivables || []).flatMap((row) => row.sales || []);
  const running = annotatePaymentRunningBalances(allSales, allCustomerPayments);
  const saleRefById = new Map(
    allSales.map((sale) => [
      sale.id,
      `${displayDateFr(sale.sale_date)} · ${shortRef(sale.id)}`,
    ]),
  );
  const arrivalRefById = new Map(
    (allArrivals || []).map((arrival) => [
      arrival.id,
      `${displayDateFr(arrival.arrival_date)} · ${shortRef(arrival.id)}`,
    ]),
  );

  const customerPayments = (periodCustomerPayments || []).map((row) => {
    const balance = running.get(row.id);
    return {
      id: row.id,
      payment_date: row.payment_date,
      customerName: row.customers?.name || "Client",
      amount_fcfa: row.amount_fcfa,
      paymentMethodLabel: paymentMethodLabel(row.payment_method),
      saleReference: row.sale_id ? saleRefById.get(row.sale_id) || shortRef(row.sale_id) : "—",
      previousOutstanding: balance ? balance.previous : null,
      remainingAfter: balance ? balance.remaining : null,
      note: row.note,
      reference: shortRef(row.id),
    };
  });

  const supplierPayments = (periodSupplierPayments || []).map((row) => ({
    id: row.id,
    payment_date: row.payment_date,
    supplierName: supplierDisplayLabel(row.suppliers) || "Fournisseur",
    amount_fcfa: row.amount_fcfa,
    paymentMethodLabel: paymentMethodLabel(row.payment_method),
    arrivalReference: row.arrival_id
      ? arrivalRefById.get(row.arrival_id) || shortRef(row.arrival_id)
      : "—",
    note: row.note,
    reference: shortRef(row.id),
  }));

  const receivableByCustomer = new Map(
    (business.receivables || []).map((row) => [row.customer?.id, row]),
  );
  const payableBySupplier = new Map(
    (business.payables || []).map((row) => [row.supplier?.id, row]),
  );

  return buildExcelWorkbookData(
    {
      periodLabel: range.periodLabel || "",
      periodKind,
      range,
      generatedAt,
      business: {
        revenue: business.revenue,
        cogs: business.cogs,
        grossMargin: business.grossMargin,
        operatingExpenses: business.operatingExpenses,
        estimatedProfit: business.estimatedProfit,
        cashCollected: business.cashCollected,
        receivablesTotal: business.receivablesTotal,
        payablesTotal: business.payablesTotal,
        stockUnits: business.stockUnits,
      },
      sales: business.sales || [],
      remainderBySaleId,
      customerPayments,
      arrivals,
      supplierPayments,
      supplierPaymentsAll: allSupplierPayments,
      receivables: business.receivables || [],
      payables: business.payables || [],
      customers: (customers || []).map((customer) => {
        const row = receivableByCustomer.get(customer.id);
        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          note: customer.note,
          purchases: row?.purchases ?? 0,
          paid: row?.paid ?? 0,
          outstanding: row?.outstanding ?? 0,
        };
      }),
      suppliers: (suppliers || []).map((supplier) => {
        const row = payableBySupplier.get(supplier.id);
        return {
          id: supplier.id,
          name: supplierDisplayLabel(supplier) || supplier.name,
          phone: supplier.phone,
          note: supplier.note,
          merchandise: row?.merchandise ?? 0,
          paid: row?.paid ?? 0,
          outstanding: row?.outstanding ?? 0,
        };
      }),
      expenses: (expenses || [])
        .filter((row) => !row.is_arrival_cost_allocation)
        .map((row) => ({
          id: row.id,
          date: row.expense_date,
          category: EXPENSE_CATEGORY_LABELS[row.category] || row.category,
          amount: row.amount_fcfa,
          reason: row.description,
          relatedLabel: row.arrival_id
            ? arrivalRefById.get(row.arrival_id) || shortRef(row.arrival_id)
            : "—",
          note: row.note,
          reference: shortRef(row.id),
        })),
      allArrivals,
      arrivalInventory,
      stock: business.inventory || [],
    },
    "business",
  );
}
