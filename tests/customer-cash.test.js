import { describe, expect, it } from "vitest";
import {
  calculateCustomerOutstanding,
  calculatePeriodBusinessTotals,
  cashReceivedOnDate,
  customerCashEvents,
  CUSTOMER_CASH_SOURCE,
  latestCustomerCashEvent,
  saleItemsTotal,
} from "../src/utils/business-calc.js";
import { lastPaymentLine, debtorDueLine, debtorCardHtml } from "../src/modules/business/business-ui.js";
import { stockProductCardHtml } from "../src/modules/business/business-inventory.js";
import { normalizeSale, normalizeSalePaidAtSale } from "../src/utils/history-events.js";

const TODAY = "2026-09-08";

const partialSale = {
  id: "sale-partial",
  customer_id: "c-test",
  sale_date: TODAY,
  created_at: `${TODAY}T08:00:00Z`,
  amount_paid_fcfa: 80000,
  payment_method: "cash",
  customers: { name: "TEST PARTIAL PAYMENT" },
  sale_items: [{ quantity: 1, sale_unit_price_fcfa: 150000 }],
};

const laterPayment = {
  id: "pay-20",
  customer_id: "c-test",
  amount_fcfa: 20000,
  payment_date: TODAY,
  created_at: `${TODAY}T12:00:00Z`,
  payment_method: "cash",
  customers: { name: "TEST PARTIAL PAYMENT" },
};

describe("canonical customer cash (no double count)", () => {
  it("counts sale-time paid-now in today's receipts without a customer_payments row", () => {
    const purchases = saleItemsTotal(partialSale);
    expect(purchases).toBe(150000);
    expect(
      calculateCustomerOutstanding({
        purchases,
        paidAtSale: 80000,
        payments: 0,
      }),
    ).toBe(70000);

    const events = customerCashEvents({ sales: [partialSale], payments: [] });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe(CUSTOMER_CASH_SOURCE.atSale);
    expect(cashReceivedOnDate(events, TODAY)).toBe(80000);
    expect(latestCustomerCashEvent(events).amount_fcfa).toBe(80000);
    expect(lastPaymentLine(latestCustomerCashEvent(events))).toMatch(/80[\s\u00a0\u202f]000 FCFA · 08\/09\/2026/);
  });

  it("adds a later payment once and keeps cash vs outstanding distinct", () => {
    const purchases = saleItemsTotal(partialSale);
    const events = customerCashEvents({
      sales: [partialSale],
      payments: [laterPayment],
    });
    expect(events).toHaveLength(2);
    expect(cashReceivedOnDate(events, TODAY)).toBe(100000);
    expect(latestCustomerCashEvent(events).amount_fcfa).toBe(20000);
    expect(latestCustomerCashEvent(events).source).toBe(CUSTOMER_CASH_SOURCE.later);
    expect(lastPaymentLine(latestCustomerCashEvent(events))).toMatch(/20[\s\u00a0\u202f]000 FCFA · 08\/09\/2026/);
    expect(
      calculateCustomerOutstanding({
        purchases,
        paidAtSale: 80000,
        payments: 20000,
      }),
    ).toBe(50000);

    const totals = calculatePeriodBusinessTotals({
      saleItems: partialSale.sale_items,
      sales: [partialSale],
      customerPayments: [laterPayment],
      expenses: [],
    });
    expect(totals.revenue).toBe(150000);
    expect(totals.cashCollected).toBe(100000);
    expect(totals.creditIssued).toBe(70000);
  });

  it("does not invent a second row for the 80 000 paid at sale", () => {
    const events = customerCashEvents({ sales: [partialSale], payments: [] });
    expect(events.filter((row) => row.amount_fcfa === 80000)).toHaveLength(1);
    expect(normalizeSalePaidAtSale(partialSale)?.amount).toBe(80000);
    expect(normalizeSale(partialSale).amount).toBe(150000);
  });

  it("shows Aucun when the customer never paid", () => {
    expect(lastPaymentLine(null)).toBe("Aucun");
    expect(lastPaymentLine({ amount_fcfa: 0, payment_date: TODAY })).toBe("Aucun");
    expect(latestCustomerCashEvent([])).toBeNull();
  });
});

describe("debtor card layout", () => {
  it("puts name + amount on the first row, last payment and due on their own blocks", () => {
    const html = debtorCardHtml({
      customer: { id: "c1", name: "Bob" },
      outstanding: 70000,
      lastPayment: { amount_fcfa: 80000, payment_date: TODAY },
      dueSale: { repayment_expectation: "exact", repayment_exact_date: "2026-09-15" },
    });
    expect(html).toContain("debtor-card");
    expect(html).toContain("Bob");
    expect(html).toContain("à recevoir");
    expect(html).toContain("Dernier paiement");
    expect(html).toContain("08/09/2026");
    expect(html).toContain("Échéance");
    expect(html).toContain("15/09/2026");
    expect(html.indexOf("Dernier paiement")).toBeLessThan(html.indexOf("Échéance"));
    expect(html).not.toContain("Dernier paiement :");
    expect(debtorDueLine(null)).toBe("Indéterminée");
  });
});

describe("stock overview", () => {
  it("uses a single available line and hides zero adjustments", () => {
    const html = stockProductCardHtml({
      product_id: "p1",
      product_name: "Pommes",
      unit_type: "sac",
      quantity_available: 31,
      quantity_received: 55,
      quantity_sold: 24,
      quantity_adjustments: 0,
    });
    expect(html).toContain("Pommes");
    expect(html).toContain("31 sacs disponibles");
    expect(html).toContain("Reçus");
    expect(html).toContain("55");
    expect(html).toContain("Vendus");
    expect(html).toContain("24");
    expect(html).not.toContain("Stock disponible");
    expect(html).not.toContain("Ajustements");
  });
});
