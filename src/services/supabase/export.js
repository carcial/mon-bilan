/**
 * Domain-scoped Excel export. Fetches only the active universe.
 */

import { getChurchReport, getReconciliations } from "./church.js";
import {
  getArrivals,
  getBusinessReport,
  getExpenses,
  saleTotal,
} from "./business.js";
import { toFcfaInteger } from "../../utils/money.js";
import { EXPENSE_CATEGORY_LABELS } from "../../utils/history-events.js";
import { displayDateFr } from "../../utils/dates.js";
import { buildExcelWorkbookData } from "../../utils/excel-workbook.js";

const PAYMENT_LABELS = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  bank: "Virement bancaire",
};
const SETTLEMENT_LABELS = {
  paid: "Payé en totalité",
  partial: "Paiement partiel",
  credit: "À crédit",
};

/**
 * @param {{ from: string|null, to: string|null, periodLabel: string, domain?: 'church'|'business' }} range
 */
export async function getExcelExportData(range) {
  const domain = range.domain === "church" ? "church" : "business";
  const generatedAt = displayDateFr(new Date());

  if (domain === "church") {
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
    return buildExcelWorkbookData(
      {
        periodLabel: range.periodLabel || "",
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
        },
        churchIncome,
        churchExpense,
        churchReconciliations: reconciliations.filter((row) => {
          const day = String(row.reconciled_at || "").slice(0, 10);
          if (range.from && day < range.from) return false;
          if (range.to && day > range.to) return false;
          return true;
        }),
      },
      "church",
    );
  }

  const [business, arrivals, expenses] = await Promise.all([
    getBusinessReport(range),
    getArrivals({ from: range.from, to: range.to }),
    getExpenses({ from: range.from, to: range.to }),
  ]);

  const sales = (business.sales || []).map((sale) => {
    const items = sale.sale_items || [];
    const first = items[0];
    return {
      sale_date: sale.sale_date,
      customerName: sale.customers?.name || "Client",
      productName: first?.products?.name || "Produit",
      quantity: items.reduce((sum, item) => sum + toFcfaInteger(item.quantity), 0),
      total: saleTotal(sale),
      amountPaid: sale.amount_paid_fcfa,
      paymentMethod: [
        SETTLEMENT_LABELS[sale.settlement_status] || "",
        PAYMENT_LABELS[sale.payment_method] || sale.payment_method || "",
      ]
        .filter(Boolean)
        .join(" · "),
      note: sale.note,
    };
  });

  return buildExcelWorkbookData(
    {
      periodLabel: range.periodLabel || "",
      range,
      generatedAt,
      business: {
        revenue: business.revenue,
        cogs: business.cogs,
        operatingExpenses: business.operatingExpenses,
        estimatedProfit: business.estimatedProfit,
        receivablesTotal: business.receivablesTotal,
        payablesTotal: business.payablesTotal,
        stockUnits: business.stockUnits,
      },
      sales,
      arrivals: arrivals.map((row) => ({
        arrival_date: row.arrival_date,
        supplierName: row.suppliers?.name || row.suppliers?.code || "Fournisseur",
        productName: row.products?.name || "Produit",
        quantity_received: row.quantity_received,
        supplier_unit_price_fcfa: row.supplier_unit_price_fcfa,
        merchandise:
          toFcfaInteger(row.quantity_received) *
          toFcfaInteger(row.supplier_unit_price_fcfa),
        transport_fcfa: row.transport_fcfa,
        unloading_fcfa: row.unloading_fcfa,
        other_expenses_fcfa: row.other_expenses_fcfa,
        advance_paid_fcfa: row.advance_paid_fcfa,
        note: row.note,
      })),
      receivables: (business.receivables || [])
        .filter((row) => row.outstanding > 0)
        .map((row) => ({
          name: row.customer?.name || "Client",
          purchases: row.purchases,
          paid: row.paid,
          outstanding: row.outstanding,
        })),
      payables: (business.payables || [])
        .filter((row) => row.outstanding > 0)
        .map((row) => ({
          name: row.supplier?.name || row.supplier?.code || "Fournisseur",
          merchandise: row.merchandise,
          paid: row.paid,
          outstanding: row.outstanding,
        })),
      expenses: expenses
        .filter((row) => !row.is_arrival_cost_allocation)
        .map((row) => ({
          date: row.expense_date,
          category: EXPENSE_CATEGORY_LABELS[row.category] || row.category,
          amount: row.amount_fcfa,
          reason: row.description,
          note: row.note,
        })),
      stock: business.inventory || [],
    },
    "business",
  );
}
