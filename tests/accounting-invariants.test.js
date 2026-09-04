import { describe, expect, it } from "vitest";
import {
  applyCustomerPayment,
  calculateArrivalExpenses,
  calculateAvailableInventory,
  calculateCustomerOutstanding,
  calculateEffectiveUnitCost,
  calculateLineMargin,
  calculateMerchandiseValue,
  calculateOperatingExpenses,
  calculatePeriodBusinessTotals,
  calculateSaleReceivable,
  calculateSaleTotal,
  calculateSupplierOutstanding,
  calculateUnitMargin,
  computeSaleRemainders,
  inferSettlementStatus,
  paidNowForSettlement,
  saleItemsTotal,
  summarizeArrivalEngagement,
  sumRemainderOutstanding,
  supplierUnitPriceFromSaleItem,
  validateSale,
} from "../src/utils/business-calc.js";
import {
  calculateChurchFundBalance,
  calculateReconciliationDifference,
  classifyReconciliation,
} from "../src/utils/church-calc.js";
import { buildGlobalReport } from "../src/utils/global-report.js";
import { buildExcelWorkbookData } from "../src/utils/excel-workbook.js";
import { endOfMonth, endOfYear, getPeriodRange, isDateInRange, PERIODS, startOfMonth, startOfYear } from "../src/utils/periods.js";
import { toFcfaInteger } from "../src/utils/money.js";

describe("Scenario A — sale margin vs supplier amount", () => {
  const quantity = 4;
  const supplierPerBag = 35000;
  const sellingPrice = 38000;

  it("is 12 000, never the blended-cost 8 000", () => {
    const supplierAmount = calculateMerchandiseValue(quantity, supplierPerBag);
    const saleTotal = calculateSaleTotal(quantity, sellingPrice);
    const margin = calculateLineMargin(quantity, sellingPrice, supplierPerBag);
    expect(supplierAmount).toBe(140000);
    expect(saleTotal).toBe(152000);
    expect(margin).toBe(12000);
    expect(calculateUnitMargin(sellingPrice, supplierPerBag)).toBe(3000);

    const blendedPerBag = 36000;
    expect(calculateLineMargin(quantity, sellingPrice, blendedPerBag)).toBe(8000);
    expect(margin).not.toBe(8000);

    const totals = calculatePeriodBusinessTotals({
      saleItems: [
        {
          quantity,
          sale_unit_price_fcfa: sellingPrice,
          supplier_unit_price_fcfa: supplierPerBag,
          effective_unit_cost_fcfa: blendedPerBag,
        },
      ],
      sales: [{ amount_paid_fcfa: 152000 }],
    });
    expect(totals.revenue).toBe(152000);
    expect(totals.cogs).toBe(140000);
    expect(totals.grossMargin).toBe(12000);
    expect(
      supplierUnitPriceFromSaleItem({
        supplier_unit_price_fcfa: supplierPerBag,
        effective_unit_cost_fcfa: blendedPerBag,
      }),
    ).toBe(35000);
  });
});

describe("Scenario B — arrival engagement", () => {
  it("keeps 20 000 per bag and shows fees separately", () => {
    const summary = summarizeArrivalEngagement({
      quantity: 30,
      unitPrice: 20000,
      transport: 20000,
      unloading: 10000,
    });
    expect(summary.merchandise).toBe(600000);
    expect(summary.fees).toBe(30000);
    expect(summary.totalEngaged).toBe(630000);
    expect(summary.supplierAmountPerUnit).toBe(20000);
    expect(calculateArrivalExpenses({ transport: 20000, unloading: 10000 })).toBe(30000);
    expect(calculateEffectiveUnitCost(630000, 30)).toBe(21000);
    expect(summary.supplierAmountPerUnit).not.toBe(21000);
  });
});

describe("Scenario C — customer debt and FIFO payments", () => {
  const sale = {
    id: "s1",
    sale_date: "2026-09-01",
    created_at: "2026-09-01T10:00:00Z",
    amount_paid_fcfa: 30000,
    sale_items: [{ quantity: 1, sale_unit_price_fcfa: 100000 }],
  };

  it("moves 70 000 → 50 000 → 0 and never goes negative", () => {
    expect(saleItemsTotal(sale)).toBe(100000);
    expect(
      calculateCustomerOutstanding({ purchases: 100000, paidAtSale: 30000, payments: 0 }),
    ).toBe(70000);

    const after20 = calculateCustomerOutstanding({
      purchases: 100000,
      paidAtSale: 30000,
      payments: 20000,
    });
    expect(after20).toBe(50000);

    const after50 = calculateCustomerOutstanding({
      purchases: 100000,
      paidAtSale: 30000,
      payments: 70000,
    });
    expect(after50).toBe(0);
    expect(
      calculateCustomerOutstanding({
        purchases: 100000,
        paidAtSale: 30000,
        payments: 80000,
      }),
    ).toBe(0);

    const remainders = computeSaleRemainders([sale], [
      { customer_id: "c1", sale_id: "s1", amount_fcfa: 20000 },
    ]);
    expect(sumRemainderOutstanding(remainders)).toBe(50000);
    expect(sumRemainderOutstanding(remainders)).toBe(
      calculateCustomerOutstanding({ purchases: 100000, paidAtSale: 30000, payments: 20000 }),
    );

    const settled = computeSaleRemainders([sale], [
      { sale_id: "s1", amount_fcfa: 20000 },
      { sale_id: "s1", amount_fcfa: 50000 },
    ]);
    expect(sumRemainderOutstanding(settled)).toBe(0);
    expect(applyCustomerPayment(0, 1000)).toEqual({ applied: 0, remaining: 0, excess: 1000 });
  });

  it("counts a later payment exactly once (linked + unallocated FIFO)", () => {
    const sales = [
      {
        id: "old",
        sale_date: "2026-08-01",
        amount_paid_fcfa: 0,
        sale_items: [{ quantity: 1, sale_unit_price_fcfa: 40000 }],
      },
      {
        id: "new",
        sale_date: "2026-09-01",
        amount_paid_fcfa: 0,
        sale_items: [{ quantity: 1, sale_unit_price_fcfa: 60000 }],
      },
    ];
    const payments = [
      { sale_id: "new", amount_fcfa: 10000 },
      { sale_id: null, amount_fcfa: 40000 },
    ];
    const remainders = computeSaleRemainders(sales, payments);
    expect(sumRemainderOutstanding(remainders)).toBe(50000);
    expect(
      calculateCustomerOutstanding({
        purchases: 100000,
        paidAtSale: 0,
        payments: 50000,
      }),
    ).toBe(50000);
    expect(remainders.find((row) => row.saleId === "old").remaining).toBe(0);
    expect(remainders.find((row) => row.saleId === "new").remaining).toBe(50000);
  });
});

describe("Scenario D — stock", () => {
  it("received − sold ± adjustments = available", () => {
    expect(
      calculateAvailableInventory({ received: 30, sold: 4, adjustmentsDelta: -1 }),
    ).toBe(25);
  });
});

describe("Scenario E — Church balance and cash check", () => {
  it("theoretical 380 000 and difference −30 000", () => {
    const theoretical = calculateChurchFundBalance({
      openingBalance: 0,
      incomeTotal: 500000,
      expenseTotal: 120000,
    });
    expect(theoretical).toBe(380000);
    const difference = calculateReconciliationDifference({
      theoreticalBalance: theoretical,
      actualBalance: 350000,
    });
    expect(difference).toBe(-30000);
    expect(classifyReconciliation(difference)).toEqual({
      status: "shortage",
      absoluteDifference: 30000,
    });
  });
});

describe("invariants", () => {
  it("paid + outstanding = sale total; outstanding ≥ 0", () => {
    const recv = calculateSaleReceivable({ quantity: 2, unitPrice: 50000, amountPaid: 30000 });
    expect(recv.paid + recv.remaining).toBe(recv.total);
    expect(recv.remaining).toBeGreaterThanOrEqual(0);
  });

  it("settlement arithmetic ignores payment method", () => {
    const total = 100000;
    expect(paidNowForSettlement("paid", total, 0)).toBe(100000);
    expect(paidNowForSettlement("credit", total, 999)).toBe(0);
    expect(paidNowForSettlement("partial", total, 30000)).toBe(30000);
    expect(inferSettlementStatus(total, 100000)).toBe("paid");
    expect(inferSettlementStatus(total, 0)).toBe("credit");
    expect(inferSettlementStatus(total, 30000)).toBe("partial");
    const cash = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: total,
      date: "2026-09-01",
      available: 5,
      settlementStatus: "partial",
      amountPaid: 30000,
      paymentMethod: "cash",
    });
    const mm = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: total,
      date: "2026-09-01",
      available: 5,
      settlementStatus: "partial",
      amountPaid: 30000,
      paymentMethod: "mobile_money",
    });
    expect(cash.ok && mm.ok).toBe(true);
    expect(cash.amountPaid).toBe(mm.amountPaid);
    expect(cash.total).toBe(mm.total);
  });

  it("supplier fees enter debt only when the flag is set", () => {
    const merch = 600000;
    const fees = 30000;
    expect(
      calculateSupplierOutstanding({
        merchandiseValue: merch,
        arrivalExpenses: fees,
        expensesOwedToSupplier: false,
        advancePaid: 0,
        paymentsTotal: 0,
      }),
    ).toBe(600000);
    expect(
      calculateSupplierOutstanding({
        merchandiseValue: merch,
        arrivalExpenses: fees,
        expensesOwedToSupplier: true,
        advancePaid: 0,
        paymentsTotal: 0,
      }),
    ).toBe(630000);
  });

  it("supplier paid + outstanding = obligation", () => {
    const obligation = 140000;
    const paid = 40000;
    const outstanding = calculateSupplierOutstanding({
      merchandiseValue: obligation,
      advancePaid: 10000,
      paymentsTotal: 30000,
    });
    expect(outstanding).toBe(100000);
    expect(paid + outstanding).toBe(obligation);
  });

  it("available stock is not a row count", () => {
    expect(calculateAvailableInventory({ received: 0, sold: 0, adjustmentsDelta: 0 })).toBe(0);
  });

  it("never uses effective_unit_cost when supplier amount is present", () => {
    const totals = calculatePeriodBusinessTotals({
      saleItems: [
        {
          quantity: 4,
          sale_unit_price_fcfa: 38000,
          supplier_unit_price_fcfa: 35000,
          effective_unit_cost_fcfa: 36000,
        },
      ],
    });
    expect(totals.grossMargin).toBe(12000);
  });

  it("reads nested arrival supplier amount", () => {
    expect(
      supplierUnitPriceFromSaleItem({
        stock_arrivals: { supplier_unit_price_fcfa: 35000 },
        effective_unit_cost_fcfa: 36000,
      }),
    ).toBe(35000);
  });

  it("does not double-count arrival allocations in opex", () => {
    expect(
      calculateOperatingExpenses([
        { amount_fcfa: 20000, is_arrival_cost_allocation: true },
        { amount_fcfa: 8000, is_arrival_cost_allocation: false },
      ]),
    ).toBe(8000);
  });
});

describe("cross-screen totals", () => {
  const saleItems = [
    {
      quantity: 4,
      sale_unit_price_fcfa: 38000,
      supplier_unit_price_fcfa: 35000,
      effective_unit_cost_fcfa: 36000,
    },
  ];
  const sales = [{ amount_paid_fcfa: 30000 }];
  const customerPayments = [{ amount_fcfa: 20000 }];
  const expenses = [{ amount_fcfa: 5000, is_arrival_cost_allocation: false }];

  it("calc layer, global report and Excel résumé share the same numbers", () => {
    const totals = calculatePeriodBusinessTotals({
      saleItems,
      sales,
      customerPayments,
      expenses,
    });
    expect(totals.revenue).toBe(152000);
    expect(totals.cogs).toBe(140000);
    expect(totals.grossMargin).toBe(12000);
    expect(totals.cashCollected).toBe(50000);
    expect(totals.creditIssued).toBe(122000);
    expect(totals.operatingExpenses).toBe(5000);
    expect(totals.estimatedProfit).toBe(7000);

    const report = buildGlobalReport({
      range: { from: "2026-09-01", to: "2026-09-01" },
      business: { saleItems, sales, customerPayments, expenses },
    });
    expect(report.business.revenue).toBe(totals.revenue);
    expect(report.business.cogs).toBe(totals.cogs);
    expect(report.business.grossMargin).toBe(totals.grossMargin);
    expect(report.business.estimatedProfit).toBe(totals.estimatedProfit);
    expect(report.business.cashCollected).toBe(totals.cashCollected);

    const workbook = buildExcelWorkbookData(
      {
        periodLabel: "Aujourd'hui",
        range: { from: "2026-09-01", to: "2026-09-01" },
        generatedAt: "1 septembre 2026",
        business: {
          revenue: totals.revenue,
          cogs: totals.cogs,
          operatingExpenses: totals.operatingExpenses,
          estimatedProfit: totals.estimatedProfit,
          receivablesTotal: 102000,
          payablesTotal: 0,
          stockUnits: 25,
        },
        sales: [],
        arrivals: [],
        receivables: [{ name: "Client", purchases: 152000, paid: 50000, outstanding: 102000 }],
        payables: [],
        expenses: [],
        stock: [],
      },
      "business",
    );
    const resume = workbook.sheets[0].rows;
    const valueFor = (label) => resume.find((row) => row[0].value === label)?.[1].value;
    expect(valueFor("Chiffre d'affaires")).toBe(152000);
    expect(valueFor("Montant fournisseur (quantité vendue)")).toBe(140000);
    expect(valueFor("Bénéfice estimé")).toBe(7000);
    expect(valueFor("À recevoir (état actuel)")).toBe(102000);
  });
});

describe("date boundaries", () => {
  it("covers first/last of month, year edge, and same-day custom range", () => {
    const first = new Date(2026, 8, 1);
    const last = new Date(2026, 8, 30);
    expect(getPeriodRange(PERIODS.month, { now: first })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(getPeriodRange(PERIODS.month, { now: last })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(startOfMonth(first).getDate()).toBe(1);
    expect(endOfMonth(first).getDate()).toBe(30);

    const nye = new Date(2026, 11, 31);
    expect(getPeriodRange(PERIODS.year, { now: nye })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(startOfYear(nye).getFullYear()).toBe(2026);
    expect(endOfYear(nye).getDate()).toBe(31);

    const jan = new Date(2027, 0, 1);
    expect(getPeriodRange(PERIODS.year, { now: jan }).from).toBe("2027-01-01");
    expect(isDateInRange("2026-12-31", "2027-01-01", "2027-12-31")).toBe(false);

    const sameDay = getPeriodRange(PERIODS.custom, { from: "2026-09-01", to: "2026-09-01" });
    expect(sameDay).toEqual({ from: "2026-09-01", to: "2026-09-01" });
    expect(isDateInRange("2026-09-01", sameDay.from, sameDay.to)).toBe(true);
  });
});

describe("integer money", () => {
  it("multiplies large FCFA values without float drift", () => {
    expect(calculateSaleTotal(1, 38000)).toBe(38000);
    expect(calculateSaleTotal(4, 38000)).toBe(152000);
    expect(calculateSaleTotal(17, 999999)).toBe(16999983);
    expect(toFcfaInteger(0.1 + 0.2)).toBe(0);
  });
});
