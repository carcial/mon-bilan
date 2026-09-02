import { describe, expect, it } from "vitest";
import {
  applyCustomerPayment,
  calculateArrivalExpenses,
  calculateAvailableInventory,
  calculateCogs,
  calculateEffectiveBatchCost,
  calculateEffectiveUnitCost,
  calculateEstimatedProfit,
  calculateLineMargin,
  calculateMerchandiseValue,
  calculateOperatingExpenses,
  calculatePeriodBusinessTotals,
  calculateSaleReceivable,
  calculateSaleTotal,
  calculateSupplierOutstanding,
  calculateUnitMargin,
  canSellQuantity,
  inferPaymentMethod,
  isSaleAtLoss,
  validateArrival,
  validateSale,
} from "../src/utils/business-calc.js";
import { matchBusinessRoute } from "../src/modules/business/business-routes.js";

describe("arrival costing", () => {
  it("computes merchandise, batch and unit cost", () => {
    expect(calculateMerchandiseValue(30, 25000)).toBe(750000);
    expect(calculateArrivalExpenses({ transport: 30000, unloading: 10000, other: 5000 })).toBe(45000);
    const batch = calculateEffectiveBatchCost({
      quantity: 30,
      unitPrice: 25000,
      transport: 30000,
      unloading: 10000,
      other: 5000,
    });
    expect(batch).toBe(795000);
    expect(calculateEffectiveUnitCost(batch, 30)).toBe(26500);
  });

  it("keeps supplier liability on merchandise unless expenses are owed to supplier", () => {
    expect(
      calculateSupplierOutstanding({
        merchandiseValue: 750000,
        advancePaid: 200000,
        paymentsTotal: 0,
      }),
    ).toBe(550000);
    expect(
      calculateSupplierOutstanding({
        merchandiseValue: 750000,
        arrivalExpenses: 45000,
        expensesOwedToSupplier: true,
        advancePaid: 200000,
        paymentsTotal: 100000,
      }),
    ).toBe(495000);
  });
});

describe("inventory", () => {
  it("derives remaining stock from received, sold and adjustments", () => {
    expect(calculateAvailableInventory({ received: 30, sold: 14, adjustmentsDelta: -1 })).toBe(15);
    expect(canSellQuantity(10, 10)).toBe(true);
    expect(canSellQuantity(10, 11)).toBe(false);
    expect(canSellQuantity(10, 0)).toBe(false);
  });
});

describe("sales and payments", () => {
  it("handles cash, credit and partial sales", () => {
    expect(calculateSaleTotal(5, 31000)).toBe(155000);
    expect(calculateSaleReceivable({ quantity: 5, unitPrice: 31000, amountPaid: 155000 })).toEqual({
      total: 155000,
      paid: 155000,
      remaining: 0,
    });
    expect(calculateSaleReceivable({ quantity: 5, unitPrice: 31000, amountPaid: 0 })).toEqual({
      total: 155000,
      paid: 0,
      remaining: 155000,
    });
    expect(calculateSaleReceivable({ quantity: 5, unitPrice: 31000, amountPaid: 50000 })).toEqual({
      total: 155000,
      paid: 50000,
      remaining: 105000,
    });
    expect(inferPaymentMethod(155000, 155000)).toBe("cash");
    expect(inferPaymentMethod(155000, 0)).toBe("credit");
    expect(inferPaymentMethod(155000, 50000)).toBe("partial");
  });

  it("applies a later customer payment", () => {
    expect(applyCustomerPayment(105000, 40000)).toEqual({
      applied: 40000,
      remaining: 65000,
      excess: 0,
    });
  });

  it("detects a sale below cost", () => {
    expect(calculateUnitMargin(24000, 26500)).toBe(-2500);
    expect(isSaleAtLoss(24000, 26500)).toBe(true);
    expect(calculateLineMargin(5, 24000, 26500)).toBe(-12500);
    expect(calculateCogs(5, 26500)).toBe(132500);
  });
});

describe("expenses and profit", () => {
  it("excludes arrival allocations from operating expenses", () => {
    const opex = calculateOperatingExpenses([
      { amount_fcfa: 42000, is_arrival_cost_allocation: false },
      { amount_fcfa: 30000, is_arrival_cost_allocation: true },
    ]);
    expect(opex).toBe(42000);
    expect(
      calculateEstimatedProfit({
        revenue: 425000,
        cogs: 314500,
        operatingExpenses: 42000,
      }),
    ).toBe(68500);
  });

  it("builds a period summary", () => {
    const totals = calculatePeriodBusinessTotals({
      saleItems: [
        { quantity: 14, sale_unit_price_fcfa: 30000, effective_unit_cost_fcfa: 26500 },
      ],
      sales: [{ amount_paid_fcfa: 310000 }],
      customerPayments: [],
      expenses: [{ amount_fcfa: 42000, is_arrival_cost_allocation: false }],
    });
    expect(totals.revenue).toBe(420000);
    expect(totals.cashCollected).toBe(310000);
    expect(totals.creditIssued).toBe(110000);
    expect(totals.cogs).toBe(371000);
    expect(totals.operatingExpenses).toBe(42000);
    expect(totals.unitsSold).toBe(14);
    expect(totals.estimatedProfit).toBe(420000 - 371000 - 42000);
  });
});

describe("validation", () => {
  it("validates an arrival", () => {
    expect(
      validateArrival({
        supplierId: "s",
        productId: "p",
        quantity: 30,
        unitPrice: 25000,
        date: "2026-09-02",
      }).ok,
    ).toBe(true);
    expect(validateArrival({ quantity: 0 }).ok).toBe(false);
  });

  it("blocks oversell", () => {
    const result = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 11,
      unitPrice: 30000,
      date: "2026-09-02",
      available: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.quantity).toMatch(/Stock insuffisant/);
  });
});

describe("business routes", () => {
  it("parses commerce sub-routes", () => {
    expect(matchBusinessRoute("/commerce")).toEqual({ name: "dashboard" });
    expect(matchBusinessRoute("/commerce/vente")).toEqual({ name: "sale" });
    expect(matchBusinessRoute("/commerce/arrivee")).toEqual({ name: "arrival" });
    expect(matchBusinessRoute("/commerce/clients")).toEqual({ name: "customers" });
    expect(matchBusinessRoute("/commerce/a-recevoir")).toEqual({ name: "receivables" });
    expect(matchBusinessRoute("/commerce/bordereau/xyz")).toEqual({
      name: "bordereau",
      id: "xyz",
    });
  });
});
