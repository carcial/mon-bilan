import { describe, expect, it } from "vitest";
import {
  allocatePaymentFifo,
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
  computeSaleRemainders,
  inferPaymentMethod,
  inferSettlementStatus,
  isSaleAtLoss,
  paidNowForSettlement,
  validateArrival,
  validateMoneyPayment,
  validateSale,
} from "../src/utils/business-calc.js";
import { customerComboboxState, findCustomerByName, resolveSaleCustomer } from "../src/utils/choice-ui.js";
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
    expect(inferPaymentMethod(155000, 155000)).toBe("paid");
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

  it("detects a sale below the supplier amount", () => {
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
        { quantity: 14, sale_unit_price_fcfa: 30000, supplier_unit_price_fcfa: 25000, effective_unit_cost_fcfa: 26500 },
      ],
      sales: [{ amount_paid_fcfa: 310000 }],
      customerPayments: [],
      expenses: [{ amount_fcfa: 42000, is_arrival_cost_allocation: false }],
    });
    expect(totals.revenue).toBe(420000);
    expect(totals.cashCollected).toBe(310000);
    expect(totals.creditIssued).toBe(110000);
    expect(totals.cogs).toBe(350000);
    expect(totals.operatingExpenses).toBe(42000);
    expect(totals.unitsSold).toBe(14);
    expect(totals.estimatedProfit).toBe(420000 - 350000 - 42000);
    expect(totals.grossMargin).toBe(70000);
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

describe("settlement vs payment method", () => {
  it("separates paid / partial / credit from cash instruments", () => {
    expect(inferSettlementStatus(100000, 100000)).toBe("paid");
    expect(inferSettlementStatus(100000, 30000)).toBe("partial");
    expect(inferSettlementStatus(100000, 0)).toBe("credit");
    expect(paidNowForSettlement("paid", 100000, 0)).toBe(100000);
    expect(paidNowForSettlement("credit", 100000, 50)).toBe(0);
    expect(paidNowForSettlement("partial", 100000, 30000)).toBe(30000);
  });

  it("requires a payment method only when money is received now", () => {
    const paid = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: 100000,
      date: "2026-09-03",
      available: 5,
      settlementStatus: "paid",
      paymentMethod: "mobile_money",
    });
    expect(paid.ok).toBe(true);
    expect(paid.amountPaid).toBe(100000);
    expect(paid.method).toBe("mobile_money");

    const credit = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: 100000,
      date: "2026-09-03",
      available: 5,
      settlementStatus: "credit",
      repaymentExpectation: "undetermined",
    });
    expect(credit.ok).toBe(true);
    expect(credit.amountPaid).toBe(0);
    expect(credit.method).toBeNull();

    const partial = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: 100000,
      date: "2026-09-03",
      available: 5,
      settlementStatus: "partial",
      amountPaid: 30000,
      paymentMethod: "bank",
      repaymentExpectation: "exact",
      repaymentExactDate: "2026-09-15",
    });
    expect(partial.ok).toBe(true);
    expect(partial.amountPaid).toBe(30000);

    const missingDate = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: 100000,
      date: "2026-09-03",
      available: 5,
      settlementStatus: "credit",
      repaymentExpectation: "exact",
    });
    expect(missingDate.ok).toBe(false);
    expect(missingDate.errors.repaymentExactDate).toBeTruthy();

    const approx = validateSale({
      customerId: "c",
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: 100000,
      date: "2026-09-03",
      available: 5,
      settlementStatus: "partial",
      amountPaid: 20000,
      paymentMethod: "cash",
      repaymentExpectation: "approximate",
      repaymentApproxText: "Début octobre",
    });
    expect(approx.ok).toBe(true);
  });

  it("blocks overpayment and reaches zero remaining", () => {
    expect(validateMoneyPayment({ amount: 80000, date: "2026-09-03", paymentMethod: "cash", outstanding: 65000 }).ok).toBe(false);
    expect(validateMoneyPayment({ amount: 80000, date: "2026-09-03", paymentMethod: "cash", outstanding: 65000 }).errors.amount).toMatch(/dépasse/);
    expect(applyCustomerPayment(50000, 50000)).toEqual({ applied: 50000, remaining: 0, excess: 0 });
  });

  it("allocates later payments FIFO to the oldest sale", () => {
    const remainders = computeSaleRemainders(
      [
        { id: "s2", sale_date: "2026-09-10", amount_paid_fcfa: 0, sale_items: [{ quantity: 1, sale_unit_price_fcfa: 40000 }] },
        { id: "s1", sale_date: "2026-09-01", amount_paid_fcfa: 0, sale_items: [{ quantity: 1, sale_unit_price_fcfa: 70000 }] },
      ],
      [],
    );
    expect(remainders[0].saleId).toBe("s1");
    const { allocations } = allocatePaymentFifo(remainders, 20000);
    expect(allocations).toEqual([{ saleId: "s1", amount: 20000 }]);
  });

  it("reuses an existing customer instead of creating a duplicate", () => {
    const customers = [{ id: "c1", name: "Maman Jeanne" }];
    expect(findCustomerByName(customers, "  maman   jeanne ")).toEqual(customers[0]);
    expect(customerComboboxState(customers, "Maman Jeanne").canCreate).toBe(false);
    expect(resolveSaleCustomer({ newCustomerName: "Maman Jeanne" }, customers).customerId).toBe("c1");
  });
});

describe("business routes", () => {
  it("parses commerce sub-routes", () => {
    expect(matchBusinessRoute("/commerce")).toEqual({ name: "dashboard" });
    expect(matchBusinessRoute("/commerce/vente")).toEqual({ name: "sale" });
    expect(matchBusinessRoute("/commerce/arrivee")).toEqual({ name: "arrival" });
    expect(matchBusinessRoute("/commerce/clients")).toEqual({ name: "customers" });
    expect(matchBusinessRoute("/commerce/a-recevoir")).toEqual({ name: "receivables" });
    expect(matchBusinessRoute("/commerce/a-recevoir/paiement")).toEqual({ name: "customer-payment" });
    expect(matchBusinessRoute("/commerce/bordereau/xyz")).toEqual({
      name: "bordereau",
      id: "xyz",
    });
  });
});
