/**
 * Pure Excel export helpers — mapping and labels only.
 * Financial numbers come from business-calc / church-calc; this file does not
 * invent formulas.
 */

import {
  calculateArrivalExpenses,
  calculateLineMargin,
  calculateMerchandiseValue,
  calculateSupplierOutstanding,
  formatDueExpectation,
  saleItemsTotal,
  supplierUnitPriceFromSaleItem,
} from "./business-calc.js";
import { formatNumericDateFr, todayIso } from "./dates.js";
import { HISTORY_TYPE_LABELS } from "./history-events.js";
import { toFcfaInteger } from "./money.js";
import { supplierDisplayLabel } from "./supplier-label.js";

export const PAYMENT_LABELS = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  bank: "Virement bancaire",
};

export const SETTLEMENT_LABELS = {
  paid: "Payé en totalité",
  partial: "Paiement partiel",
  credit: "À crédit",
};

export const DUE_TYPE_LABELS = {
  exact: "Date exacte",
  approximate: "Approximative",
  undetermined: "Indéterminée",
};

export const EMPTY_PERIOD_MESSAGE = "Aucune donnée pour cette période.";
export const TECHNICAL_ID_HEADER = "Identifiant technique";

export function snapshotStateNote(generatedAt) {
  const date = generatedAt ? String(generatedAt) : formatNumericDateFr(new Date());
  return `État actuel au ${date} — cette feuille représente la situation actuelle et non uniquement la période du rapport.`;
}

export function shortRef(id) {
  const raw = String(id || "").replace(/-/g, "");
  if (raw.length < 8) return raw ? raw.toUpperCase() : "—";
  return raw.slice(0, 8).toUpperCase();
}

export function paymentMethodLabel(value) {
  if (!value) return "—";
  return PAYMENT_LABELS[value] || String(value);
}

export function settlementLabel(value) {
  if (!value) return "—";
  return SETTLEMENT_LABELS[value] || String(value);
}

export function dueTypeLabel(value) {
  if (!value) return DUE_TYPE_LABELS.undetermined;
  return DUE_TYPE_LABELS[value] || DUE_TYPE_LABELS.undetermined;
}

export function excelFilename(from, to, domain = "business", periodKind = "") {
  const prefix = domain === "church" ? "eglise" : "commerce";
  if (periodKind === "year" && from) {
    return `mon-bilan-${prefix}-${from.slice(0, 4)}.xlsx`;
  }
  if (periodKind === "month" && from) {
    return `mon-bilan-${prefix}-${from.slice(0, 7)}.xlsx`;
  }
  if (from && to && from === to) {
    return `mon-bilan-${prefix}-${from}.xlsx`;
  }
  if (from && to) {
    return `mon-bilan-${prefix}-${from}_${to}.xlsx`;
  }
  return `mon-bilan-${prefix}-export.xlsx`;
}

export function pickChurchFund(rows, pattern) {
  return (rows || []).find((row) => {
    const fund = row.fund || row;
    const name = String(fund?.name || "");
    const code = String(fund?.code || "");
    return pattern.test(name) || pattern.test(code);
  }) || null;
}

export function churchFundPeriodTotals(row) {
  return {
    incomeTotal: toFcfaInteger(row?.incomeTotal),
    expenseTotal: toFcfaInteger(row?.expenseTotal),
    endingBalance: toFcfaInteger(row?.endingBalance),
    netMovement:
      toFcfaInteger(row?.incomeTotal) - toFcfaInteger(row?.expenseTotal),
  };
}

/**
 * Replay sales then payments per customer (date, then created_at).
 * previous/remaining are derived from the same outstanding rule as the app.
 */
export function annotatePaymentRunningBalances(sales = [], payments = []) {
  const byCustomer = new Map();

  const bucket = (customerId) => {
    const key = customerId || "";
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { sales: [], payments: [] });
    }
    return byCustomer.get(key);
  };

  for (const sale of sales || []) bucket(sale.customer_id).sales.push(sale);
  for (const payment of payments || []) bucket(payment.customer_id).payments.push(payment);

  const result = new Map();

  for (const group of byCustomer.values()) {
    const events = [
      ...group.sales.map((sale) => ({
        type: "sale",
        date: sale.sale_date || "",
        created: sale.created_at || "",
        id: sale.id,
        debt: Math.max(
          0,
          saleItemsTotal(sale) - toFcfaInteger(sale.amount_paid_fcfa),
        ),
      })),
      ...group.payments.map((payment) => ({
        type: "pay",
        date: payment.payment_date || "",
        created: payment.created_at || "",
        id: payment.id,
        amount: toFcfaInteger(payment.amount_fcfa),
      })),
    ].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const created = String(a.created).localeCompare(String(b.created));
      if (created !== 0) return created;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    let outstanding = 0;
    for (const event of events) {
      if (event.type === "sale") {
        outstanding += event.debt;
        continue;
      }
      const previous = outstanding;
      outstanding = Math.max(0, outstanding - event.amount);
      result.set(event.id, { previous, remaining: outstanding });
    }

  }

  return result;
}

export function customerDueExport(dueSale, today = todayIso()) {
  if (!dueSale) {
    return { dueDate: null, dueLabel: "—", status: "—" };
  }
  const expectation = formatDueExpectation(dueSale);
  if (expectation.kind === "exact" && expectation.date) {
    return {
      dueDate: expectation.date,
      dueLabel: formatNumericDateFr(expectation.date),
      status: expectation.date < today ? "En retard" : "À venir",
    };
  }
  if (expectation.kind === "approximate") {
    return {
      dueDate: null,
      dueLabel: expectation.text || "Approximative",
      status: "Approximative",
    };
  }
  return { dueDate: null, dueLabel: "Indéterminée", status: "Indéterminée" };
}

export function oldestUnpaidSaleDate(remainders = []) {
  const open = (remainders || []).find((row) => toFcfaInteger(row.remaining) > 0);
  return open?.saleDate || open?.sale?.sale_date || null;
}

export function mapSaleExportRows(sales = [], remainderBySaleId = new Map()) {
  return (sales || []).map((sale) => {
    const items = sale.sale_items || [];
    const first = items[0];
    const quantity = items.reduce((sum, item) => sum + toFcfaInteger(item.quantity), 0);
    const total = saleItemsTotal(sale);
    const supplierAmount = items.reduce(
      (sum, item) =>
        sum +
        calculateMerchandiseValue(item.quantity, supplierUnitPriceFromSaleItem(item)),
      0,
    );
    const single = items.length === 1;
    const paidImmediately = toFcfaInteger(sale.amount_paid_fcfa);
    const remaining =
      remainderBySaleId.has(sale.id)
        ? toFcfaInteger(remainderBySaleId.get(sale.id))
        : Math.max(0, total - paidImmediately);
    const due = formatDueExpectation(sale);
    const lot = first?.stock_arrivals;
    return {
      id: sale.id,
      reference: shortRef(sale.id),
      sale_date: sale.sale_date,
      customerName: sale.customers?.name || sale.customerName || "Client",
      productName:
        items
          .map((item) => item.products?.name)
          .filter(Boolean)
          .join(", ") ||
        sale.productName ||
        "Produit",
      lotLabel: lot?.arrival_date
        ? `${formatNumericDateFr(lot.arrival_date)}${lot.id ? ` · ${shortRef(lot.id)}` : ""}`
        : "—",
      quantity: sale.quantity != null && !items.length ? toFcfaInteger(sale.quantity) : quantity,
      saleUnitPrice: single ? toFcfaInteger(first.sale_unit_price_fcfa) : null,
      total: sale.total != null && !items.length ? toFcfaInteger(sale.total) : total,
      supplierUnitPrice: single ? supplierUnitPriceFromSaleItem(first) : null,
      supplierAmount,
      margin: calculateLineMargin(
        single ? toFcfaInteger(first?.quantity) : 1,
        single ? first?.sale_unit_price_fcfa : total,
        single ? supplierUnitPriceFromSaleItem(first) : supplierAmount,
      ),
      paymentStatus: sale.settlement_status
        ? settlementLabel(sale.settlement_status)
        : sale.paymentMethod || "—",
      paidImmediately: sale.amountPaid != null && sale.amount_paid_fcfa == null
        ? toFcfaInteger(sale.amountPaid)
        : paidImmediately,
      remaining,
      paymentMethod: paymentMethodLabel(sale.payment_method),
      dueType: dueTypeLabel(sale.repayment_expectation),
      dueLabel:
        due.kind === "exact" && due.date
          ? formatNumericDateFr(due.date)
          : due.text || (due.kind === "undetermined" ? "—" : "—"),
      note: sale.note || "",
    };
  });
}

export function mapArrivalExportRows(arrivals = [], payments = []) {
  const paymentsByArrival = new Map();
  for (const payment of payments || []) {
    if (!payment.arrival_id) continue;
    const current = paymentsByArrival.get(payment.arrival_id) || 0;
    paymentsByArrival.set(
      payment.arrival_id,
      current + toFcfaInteger(payment.amount_fcfa),
    );
  }

  return (arrivals || []).map((row) => {
    const quantity = toFcfaInteger(row.quantity_received);
    const unit = toFcfaInteger(row.supplier_unit_price_fcfa);
    const merchandise =
      row.merchandise != null
        ? toFcfaInteger(row.merchandise)
        : calculateMerchandiseValue(quantity, unit);
    const fees = calculateArrivalExpenses({
      transport: row.transport_fcfa,
      unloading: row.unloading_fcfa,
      other: row.other_expenses_fcfa,
    });
    const remaining = calculateSupplierOutstanding({
      merchandiseValue: merchandise,
      advancePaid: row.advance_paid_fcfa,
      paymentsTotal: paymentsByArrival.get(row.id) || 0,
      arrivalExpenses: fees,
      expensesOwedToSupplier: Boolean(row.expenses_owed_to_supplier),
    });
    return {
      id: row.id,
      reference: shortRef(row.id),
      arrival_date: row.arrival_date,
      supplierName:
        supplierDisplayLabel(row.suppliers) ||
        row.supplierName ||
        row.suppliers?.name ||
        "Fournisseur",
      productName: row.products?.name || row.productName || "Produit",
      quantity_received: quantity,
      supplier_unit_price_fcfa: unit,
      merchandise,
      transport_fcfa: toFcfaInteger(row.transport_fcfa),
      unloading_fcfa: toFcfaInteger(row.unloading_fcfa),
      other_expenses_fcfa: toFcfaInteger(row.other_expenses_fcfa),
      expensesOwedToSupplier: Boolean(row.expenses_owed_to_supplier),
      advance_paid_fcfa: toFcfaInteger(row.advance_paid_fcfa),
      remaining,
      note: row.note || "",
    };
  });
}

export function mapReceivableExportRows(receivables = [], today = todayIso()) {
  return (receivables || [])
    .filter((row) => toFcfaInteger(row.outstanding) > 0)
    .map((row) => {
      const due = customerDueExport(row.dueSale, today);
      return {
        id: row.customer?.id || row.id || null,
        name: row.customer?.name || row.name || "Client",
        phone: row.customer?.phone || row.phone || "",
        purchases: toFcfaInteger(row.purchases),
        paid: toFcfaInteger(row.paid),
        outstanding: toFcfaInteger(row.outstanding),
        oldestUnpaidSale: oldestUnpaidSaleDate(row.remainders) || row.oldestUnpaid || null,
        dueLabel: due.dueLabel,
        dueStatus: due.status,
        note: row.customer?.note || row.note || "",
      };
    });
}

export function mapPayableExportRows(payables = []) {
  return (payables || [])
    .filter((row) => toFcfaInteger(row.outstanding) > 0)
    .map((row) => {
      const arrivals = row.arrivals || [];
      const feesOwed = arrivals.reduce((sum, arrival) => {
        if (!arrival.expenses_owed_to_supplier) return sum;
        return (
          sum +
          calculateArrivalExpenses({
            transport: arrival.transport_fcfa,
            unloading: arrival.unloading_fcfa,
            other: arrival.other_expenses_fcfa,
          })
        );
      }, 0);
      const merchandise = toFcfaInteger(row.merchandise);
      return {
        id: row.supplier?.id || row.id || null,
        name: supplierDisplayLabel(row.supplier) || row.name || "Fournisseur",
        merchandise,
        feesOwed,
        obligation: merchandise + feesOwed,
        paid: toFcfaInteger(row.paid),
        outstanding: toFcfaInteger(row.outstanding),
        arrivalCount: arrivals.length || toFcfaInteger(row.arrivalCount),
      };
    });
}

export function mapStockExportRows(arrivals = [], arrivalInventory = [], productInventory = []) {
  const invByArrival = new Map(
    (arrivalInventory || []).map((row) => [row.arrival_id, row]),
  );

  if (arrivals.length) {
    return arrivals.map((arrival) => {
      const inv = invByArrival.get(arrival.id);
      const received = toFcfaInteger(inv?.quantity_received ?? arrival.quantity_received);
      const sold = toFcfaInteger(inv?.quantity_sold);
      const adjustments = toFcfaInteger(inv?.quantity_adjustments);
      const available =
        inv?.quantity_remaining != null
          ? toFcfaInteger(inv.quantity_remaining)
          : received - sold + adjustments;
      return {
        id: arrival.id || null,
        productName: arrival.products?.name || "Produit",
        lotLabel: arrival.arrival_date
          ? `${formatNumericDateFr(arrival.arrival_date)} · ${shortRef(arrival.id)}`
          : shortRef(arrival.id),
        supplierName: supplierDisplayLabel(arrival.suppliers) || "Fournisseur",
        arrival_date: arrival.arrival_date,
        quantity_received: received,
        quantity_sold: sold,
        quantity_adjustments: adjustments,
        quantity_available: available,
        supplier_unit_price_fcfa: toFcfaInteger(arrival.supplier_unit_price_fcfa),
        unit_type: arrival.products?.unit_type || "sac",
      };
    });
  }

  return (productInventory || []).map((row) => ({
    id: row.product_id || row.id || null,
    productName: row.product_name || "Produit",
    lotLabel: "—",
    supplierName: "—",
    arrival_date: null,
    quantity_received: toFcfaInteger(row.quantity_received),
    quantity_sold: toFcfaInteger(row.quantity_sold),
    quantity_adjustments: toFcfaInteger(row.quantity_adjustments),
    quantity_available: toFcfaInteger(row.quantity_available),
    supplier_unit_price_fcfa: null,
    unit_type: row.unit_type || "sac",
  }));
}

export function historyTypeLabel(type) {
  return HISTORY_TYPE_LABELS[type] || type || "—";
}
