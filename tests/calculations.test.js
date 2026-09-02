import { describe, expect, it } from "vitest";
import { formatFcfa, formatFcfaSigned, toFcfaInteger } from "../src/utils/money.js";
import {
  calculateChurchFundBalance,
  calculateCombinedChurchBalance,
  calculateReconciliationDifference,
  classifyReconciliation,
} from "../src/utils/church-calc.js";
import {
  calculateMerchandiseValue,
  calculateArrivalExpenses,
  calculateEffectiveBatchCost,
  calculateEffectiveUnitCost,
  calculateSaleTotal,
  calculateSaleReceivable,
  calculateUnitMargin,
  isSaleAtLoss,
  calculateSupplierOutstanding,
  calculateAvailableInventory,
  canSellQuantity,
  applyCustomerPayment,
} from "../src/utils/business-calc.js";

describe("FCFA formatting", () => {
  it("formats with thin spaces style via fr-FR", () => {
    const out = formatFcfa(350500);
    expect(out).toContain("350");
    expect(out).toContain("500");
    expect(out).toContain("FCFA");
  });

  it("truncates to integer", () => {
    expect(toFcfaInteger(12.9)).toBe(12);
    expect(toFcfaInteger("1 250 000")).toBe(1250000);
  });

  it("formats signed differences", () => {
    expect(formatFcfaSigned(-350500)).toMatch(/^−/);
    expect(formatFcfaSigned(12000)).toMatch(/^\+/);
  });
});

describe("Church calculations", () => {
  it("computes fund balance", () => {
    expect(
      calculateChurchFundBalance({
        openingBalance: 100000,
        incomeTotal: 50000,
        expenseTotal: 20000,
      }),
    ).toBe(130000);
  });

  it("combines church funds only", () => {
    expect(
      calculateCombinedChurchBalance([
        { openingBalance: 100, incomeTotal: 0, expenseTotal: 0 },
        { openingBalance: 50, incomeTotal: 10, expenseTotal: 5 },
      ]),
    ).toBe(155);
  });

  it("classifies reconciliation", () => {
    const diff = calculateReconciliationDifference({
      theoreticalBalance: 1600500,
      actualBalance: 1250000,
    });
    expect(diff).toBe(-350500);
    expect(classifyReconciliation(diff)).toEqual({
      status: "shortage",
      absoluteDifference: 350500,
    });
    expect(classifyReconciliation(0).status).toBe("balanced");
    expect(classifyReconciliation(100).status).toBe("surplus");
  });
});

describe("Business calculations", () => {
  it("arrival costs and effective unit cost", () => {
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

  it("sale totals and receivables", () => {
    expect(calculateSaleTotal(5, 31000)).toBe(155000);
    expect(
      calculateSaleReceivable({ quantity: 5, unitPrice: 31000, amountPaid: 50000 }),
    ).toEqual({ total: 155000, paid: 50000, remaining: 105000 });
  });

  it("detects sale at loss without blocking", () => {
    expect(calculateUnitMargin(24000, 26500)).toBe(-2500);
    expect(isSaleAtLoss(24000, 26500)).toBe(true);
    expect(isSaleAtLoss(30000, 26500)).toBe(false);
  });

  it("supplier outstanding ignores transport unless paid as merchandise debt", () => {
    expect(
      calculateSupplierOutstanding({
        merchandiseValue: 750000,
        advancePaid: 200000,
        paymentsTotal: 0,
      }),
    ).toBe(550000);
  });

  it("inventory availability and sale guard", () => {
    expect(
      calculateAvailableInventory({ received: 70, sold: 52, adjustmentsDelta: -1 }),
    ).toBe(17);
    expect(canSellQuantity(18, 5)).toBe(true);
    expect(canSellQuantity(18, 19)).toBe(false);
  });

  it("partial customer payments", () => {
    expect(applyCustomerPayment(105000, 40000)).toEqual({
      applied: 40000,
      remaining: 65000,
      excess: 0,
    });
  });
});
