import { describe, expect, it } from "vitest";
import {
  applyCustomerPayment,
  calculateArrivalExpenses,
  calculateAvailableInventory,
  calculateCustomerOutstanding,
  calculateEffectiveBatchCost,
  calculateEffectiveUnitCost,
  calculateEstimatedProfit,
  calculateMerchandiseValue,
  calculateOperatingExpenses,
  calculatePeriodBusinessTotals,
  calculateSaleReceivable,
  calculateSaleTotal,
  calculateSupplierOutstanding,
  canSellQuantity,
  inferPaymentMethod,
  isSaleAtLoss,
} from "../src/utils/business-calc.js";
import {
  calculateChurchFundBalance,
  calculateCombinedChurchBalance,
  calculatePeriodTotals,
  calculateReconciliationDifference,
  classifyReconciliation,
} from "../src/utils/church-calc.js";
import { seriesHasActivity } from "../src/utils/charts-data.js";
import { customerComboboxState, resolveSaleCustomer } from "../src/utils/choice-ui.js";
import { friendlyError } from "../src/utils/errors.js";
import { buildGlobalReport, hasForbiddenCombinedTotal } from "../src/utils/global-report.js";
import {
  filterHistoryEvents,
  HISTORY_DOMAINS,
  normalizeBusinessExpense,
  normalizeChurchTransaction,
  paginateHistoryEvents,
} from "../src/utils/history-events.js";
import { getPeriodRange, periodLabelFr, PERIODS } from "../src/utils/periods.js";
import { createSubmitGuard } from "../src/utils/submit-guard.js";

describe("history search", () => {
  const church = normalizeChurchTransaction({
    id: "tx-1",
    fund_id: "f1",
    transaction_type: "expense",
    amount_fcfa: 15000,
    transaction_date: "2026-09-02",
    reason: "Dépense travaux",
    note: "Ciment",
    church_funds: { name: "Travaux" },
  });
  const expense = normalizeBusinessExpense({
    id: "ex-1",
    category: "transport",
    amount_fcfa: 5000,
    expense_date: "2026-09-02",
    description: "Dépense marché",
    note: "SOA",
  });

  it("matches accents and ignores extra spaces", () => {
    const hits = filterHistoryEvents([church], {
      domain: "church",
      search: "  depense  ",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].sourceId).toBe("tx-1");
  });

  it("does not leak business rows into church search", () => {
    expect(
      filterHistoryEvents([church, expense], { domain: "church", search: "soa" }),
    ).toHaveLength(0);
    expect(
      filterHistoryEvents([church, expense], { domain: "business", search: "soa" }),
    ).toHaveLength(1);
  });

  it("restores all domain rows when search is empty", () => {
    expect(filterHistoryEvents([church, expense], { domain: "church", search: "   " })).toHaveLength(1);
  });
});

describe("pagination completeness", () => {
  it("does not drop the last page boundary", () => {
    const events = Array.from({ length: 80 }, (_, i) => ({ id: `e-${i}` }));
    const first = paginateHistoryEvents(events, 0, 15);
    expect(first.items).toHaveLength(15);
    expect(first.hasMore).toBe(true);
    const last = paginateHistoryEvents(events, 75, 15);
    expect(last.items.map((row) => row.id)).toEqual(["e-75", "e-76", "e-77", "e-78", "e-79"]);
    expect(last.hasMore).toBe(false);
  });
});

describe("date period labels", () => {
  it("formats custom ranges in DD/MM/YYYY", () => {
    expect(
      periodLabelFr(PERIODS.custom, { from: "2026-01-01", to: "2026-12-31" }),
    ).toBe("01/01/2026 → 31/12/2026");
  });

  it("keeps same-day custom ranges and year boundaries local", () => {
    expect(getPeriodRange(PERIODS.today, { now: new Date(2026, 0, 1) })).toEqual({
      from: "2026-01-01",
      to: "2026-01-01",
    });
    expect(getPeriodRange(PERIODS.year, { now: new Date(2026, 11, 31) })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(getPeriodRange(PERIODS.custom, { from: "2026-09-03", to: "2026-09-03" })).toEqual({
      from: "2026-09-03",
      to: "2026-09-03",
    });
  });
});

describe("church algorithms", () => {
  it("keeps fund and combined balances as opening + income - expense", () => {
    const ordinary = calculateChurchFundBalance({
      openingBalance: 100000,
      incomeTotal: 50000,
      expenseTotal: 15000,
    });
    const works = calculateChurchFundBalance({
      openingBalance: 20000,
      incomeTotal: 0,
      expenseTotal: 5000,
    });
    expect(ordinary).toBe(135000);
    expect(works).toBe(15000);
    expect(calculateCombinedChurchBalance([
      { openingBalance: 100000, incomeTotal: 50000, expenseTotal: 15000 },
      { openingBalance: 20000, incomeTotal: 0, expenseTotal: 5000 },
    ])).toBe(150000);
  });

  it("classifies reconciliation from actual - theoretical", () => {
    expect(calculateReconciliationDifference({
      theoreticalBalance: 135000,
      actualBalance: 135000,
    })).toBe(0);
    expect(classifyReconciliation(-2000)).toEqual({ status: "shortage", absoluteDifference: 2000 });
    expect(classifyReconciliation(1500)).toEqual({ status: "surplus", absoluteDifference: 1500 });
  });

  it("matches report totals to a direct transaction sum", () => {
    const totals = calculatePeriodTotals([
      { transaction_type: "income", amount_fcfa: 50000 },
      { transaction_type: "expense", amount_fcfa: 15000 },
    ]);
    expect(totals).toEqual({
      incomeTotal: 50000,
      expenseTotal: 15000,
      netMovement: 35000,
    });
  });
});

describe("arrival / inventory / sale algorithms", () => {
  const merch = calculateMerchandiseValue(10, 20000);
  const expenses = calculateArrivalExpenses({ transport: 5000, unloading: 2000, other: 0 });
  const batch = calculateEffectiveBatchCost({
    quantity: 10,
    unitPrice: 20000,
    transport: 5000,
    unloading: 2000,
  });
  const unit = calculateEffectiveUnitCost(batch, 10);

  it("uses integer-safe arrival costing", () => {
    expect(merch).toBe(200000);
    expect(expenses).toBe(7000);
    expect(batch).toBe(207000);
    expect(unit).toBe(20700);
  });

  it("keeps transport out of supplier debt unless marked owed", () => {
    expect(
      calculateSupplierOutstanding({
        merchandiseValue: merch,
        arrivalExpenses: expenses,
        advancePaid: 50000,
        paymentsTotal: 40000,
      }),
    ).toBe(110000);
  });

  it("derives remaining stock and blocks oversell", () => {
    expect(calculateAvailableInventory({ received: 10, sold: 7, adjustmentsDelta: -1 })).toBe(2);
    expect(canSellQuantity(2, 3)).toBe(false);
  });

  it("computes cash / credit / partial and later payments", () => {
    expect(calculateSaleTotal(2, 25000)).toBe(50000);
    expect(calculateSaleReceivable({ quantity: 2, unitPrice: 25000, amountPaid: 50000 }).remaining).toBe(0);
    expect(calculateSaleReceivable({ quantity: 3, unitPrice: 25000, amountPaid: 0 }).remaining).toBe(75000);
    expect(calculateSaleReceivable({ quantity: 2, unitPrice: 25000, amountPaid: 20000 }).remaining).toBe(30000);
    expect(inferPaymentMethod(50000, 50000)).toBe("paid");
    expect(applyCustomerPayment(30000, 15000).remaining).toBe(15000);
    expect(
      calculateCustomerOutstanding({
        purchases: 175000,
        paidAtSale: 70000,
        payments: 15000,
      }),
    ).toBe(90000);
  });

  it("flags a sale below the supplier amount, not below blended cost", () => {
    expect(isSaleAtLoss(19999, 20000)).toBe(true);
    expect(isSaleAtLoss(20000, 20000)).toBe(false);
    expect(isSaleAtLoss(20500, 20000)).toBe(false);
    expect(isSaleAtLoss(20000, unit)).toBe(true);
  });
});

describe("expense double-counting", () => {
  it("never subtracts arrival allocations from profit", () => {
    const totals = calculatePeriodBusinessTotals({
      saleItems: [{ quantity: 7, sale_unit_price_fcfa: 25000, supplier_unit_price_fcfa: 20000, effective_unit_cost_fcfa: 20700 }],
      sales: [{ amount_paid_fcfa: 70000 }],
      customerPayments: [{ amount_fcfa: 15000 }],
      expenses: [
        { amount_fcfa: 8000, is_arrival_cost_allocation: false },
        { amount_fcfa: 7000, is_arrival_cost_allocation: true },
      ],
    });
    expect(totals.revenue).toBe(175000);
    expect(totals.cogs).toBe(140000);
    expect(totals.grossMargin).toBe(35000);
    expect(totals.operatingExpenses).toBe(8000);
    expect(totals.estimatedProfit).toBe(27000);
    expect(totals.cashCollected).toBe(85000);
    expect(calculateOperatingExpenses(totals.expenses || [])).toBe(0);
    expect(
      calculateEstimatedProfit({
        revenue: totals.revenue,
        cogs: totals.cogs,
        operatingExpenses: totals.operatingExpenses,
      }),
    ).toBe(totals.estimatedProfit);
  });
});

describe("customer autocomplete", () => {
  const customers = [
    { id: "c1", name: "Mama Jeanne" },
    { id: "c2", name: "Maman Jeannette" },
  ];

  it("reuses an existing row for Mama", () => {
    const state = customerComboboxState(customers, "Mama");
    expect(state.matches.map((row) => row.id)).toContain("c1");
    expect(resolveSaleCustomer({ customerId: "c1" }, customers)).toEqual({
      customerId: "c1",
      shouldCreate: false,
      name: null,
    });
  });

  it("creates exactly one new name after trim and rejects a blank", () => {
    const state = customerComboboxState(customers, "  Nouveau Client  ");
    expect(state.canCreate).toBe(true);
    expect(state.query).toBe("Nouveau Client");
    expect(resolveSaleCustomer({ newCustomerName: "Nouveau Client" }, customers).shouldCreate).toBe(true);
    expect(resolveSaleCustomer({ newCustomerName: "   " }, customers).shouldCreate).toBe(false);
    expect(
      resolveSaleCustomer({ newCustomerName: "Mama Jeanne" }, customers),
    ).toEqual({ customerId: "c1", shouldCreate: false, name: "Mama Jeanne" });
  });
});

describe("domain report consistency", () => {
  it("never invents a combined church+business total", () => {
    const report = buildGlobalReport({
      range: { from: "2026-09-01", to: "2026-09-30" },
      church: { transactions: [{ transaction_type: "income", amount_fcfa: 1000 }], endingTotal: 1000 },
      business: {
        saleItems: [{ quantity: 1, sale_unit_price_fcfa: 25000, supplier_unit_price_fcfa: 20000, effective_unit_cost_fcfa: 20700 }],
        sales: [{ amount_paid_fcfa: 25000 }],
        expenses: [],
        receivablesTotal: 0,
        payablesTotal: 110000,
        stockUnits: 2,
      },
    });
    expect(report.church.incomeTotal).toBe(1000);
    expect(report.business.revenue).toBe(25000);
    expect(report.business.grossMargin).toBe(5000);
    expect(hasForbiddenCombinedTotal(report)).toBe(false);
    expect(report.churchPlusBusiness).toBeUndefined();
  });
});

describe("charts and errors", () => {
  it("treats an all-zero series as empty", () => {
    expect(seriesHasActivity([{ values: [0, 0, 0] }, { values: [0, 0] }])).toBe(false);
    expect(seriesHasActivity([{ values: [0, 15000] }])).toBe(true);
  });

  it("keeps French application errors and hides PostgREST dumps", () => {
    expect(friendlyError(new Error("Cette vente a des paiements liés."))).toBe(
      "Cette vente a des paiements liés.",
    );
    expect(friendlyError(new Error("Quantité insuffisante sur ce bordereau (dispo: 5)"))).toBe(
      "Stock insuffisant. La vente n'a pas été enregistrée.",
    );
    expect(friendlyError(new Error("PGRST204 column missing"))).not.toMatch(/PGRST/);
  });
});

describe("duplicate submit guard", () => {
  it("skips a second tap while the first write is running", async () => {
    const guard = createSubmitGuard();
    let starts = 0;
    const slow = () => {
      starts += 1;
      return new Promise((resolve) => setTimeout(resolve, 20));
    };
    const [first, second] = await Promise.all([guard.run(slow), guard.run(slow)]);
    expect(starts).toBe(1);
    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
  });
});
