import { describe, expect, it } from "vitest";
import { formatFcfa, formatFcfaCompact, formatFcfaSigned, toFcfaInteger } from "../src/utils/money.js";
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
  summarizeArrivalEngagement,
  arrivalFeeInclusionLabel,
  calculateSaleTotal,
  calculateSaleReceivable,
  calculateUnitMargin,
  isSaleAtLoss,
  calculateSupplierOutstanding,
  calculateAvailableInventory,
  canSellQuantity,
  applyCustomerPayment,
  sumAvailableInventory,
} from "../src/utils/business-calc.js";

describe("FCFA formatting", () => {
  it("formats with thin spaces style via fr-FR", () => {
    const out = formatFcfa(350500);
    expect(out).toContain("350");
    expect(out).toContain("500");
    expect(out).toContain("FCFA");
  });

  it("truncates to integer and does not swallow decimal points", () => {
    expect(toFcfaInteger(12.9)).toBe(12);
    expect(toFcfaInteger("1 250 000")).toBe(1250000);
    expect(toFcfaInteger("35000.5")).toBe(35000);
    expect(toFcfaInteger("35 000,5")).toBe(35000);
    expect(toFcfaInteger("35000 FCFA")).toBe(35000);
  });

  it("formats signed differences", () => {
    expect(formatFcfaSigned(-350500)).toMatch(/^−/);
    expect(formatFcfaSigned(12000)).toMatch(/^\+/);
  });

  it("formats compact axis labels", () => {
    expect(formatFcfaCompact(0)).toBe("0");
    expect(formatFcfaCompact(185500)).toBe("186k");
    expect(formatFcfaCompact(1_200_000)).toBe("1,2M");
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

  it("keeps supplier per-bag amount separate from fees (30 × 20 000 + 30 000)", () => {
    const summary = summarizeArrivalEngagement({
      quantity: 30,
      unitPrice: 20000,
      transport: 20000,
      unloading: 10000,
      other: 0,
    });
    expect(summary.supplierAmountPerUnit).toBe(20000);
    expect(summary.merchandise).toBe(600000);
    expect(summary.fees).toBe(30000);
    expect(summary.totalEngaged).toBe(630000);
    expect(summary.feeLabel).toBe("inclut transport + déchargement");
    expect(arrivalFeeInclusionLabel({ transport: 20000, unloading: 10000 })).toBe(
      "inclut transport + déchargement",
    );
    const internalUnitCost = calculateEffectiveUnitCost(summary.totalEngaged, summary.quantity);
    expect(internalUnitCost).toBe(21000);
    expect(summary.supplierAmountPerUnit).not.toBe(internalUnitCost);
    expect(summary.supplierAmountPerUnit).not.toBe(21000);
    expect(isSaleAtLoss(20500, internalUnitCost)).toBe(true);
    expect(isSaleAtLoss(20500, summary.supplierAmountPerUnit)).toBe(false);
  });

  it("sale totals and receivables", () => {
    expect(calculateSaleTotal(5, 31000)).toBe(155000);
    expect(
      calculateSaleReceivable({ quantity: 5, unitPrice: 31000, amountPaid: 50000 }),
    ).toEqual({ total: 155000, paid: 50000, remaining: 105000 });
  });

  it("detects sale below the supplier amount, not blended cost", () => {
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

  it("sums available quantity instead of counting inventory rows or batches", () => {
    const remaining = calculateAvailableInventory({
      received: 12,
      sold: 12,
      adjustmentsDelta: 0,
    });
    const inventory = [
      {
        product_id: "p1",
        product_name: "Pommes",
        unit_type: "sac",
        quantity_received: 12,
        quantity_sold: 12,
        quantity_adjustments: 0,
        quantity_available: remaining,
      },
    ];
    expect(remaining).toBe(0);
    expect(inventory.length).toBe(1);
    expect(sumAvailableInventory(inventory)).toBe(0);
  });

  it("partial customer payments", () => {
    expect(applyCustomerPayment(105000, 40000)).toEqual({
      applied: 40000,
      remaining: 65000,
      excess: 0,
    });
  });
});
