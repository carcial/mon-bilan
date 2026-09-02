import { describe, expect, it } from "vitest";
import {
  formatFcfa,
  formatFcfaSigned,
  toFcfaInteger,
} from "../src/utils/money.js";
import {
  calculateChurchFundBalance,
  calculateCombinedChurchBalance,
  calculateExpectedBalance,
  calculateNetMovement,
  calculatePeriodTotals,
  calculateReconciliationDifference,
  calculateTotalsByFund,
  classifyReconciliation,
  filterTransactions,
  groupTransactionsByPeriod,
  validateChurchTransaction,
  wouldMakeNegativeBalance,
} from "../src/utils/church-calc.js";
import { formatLongDateFr, parseLocalDate } from "../src/utils/dates.js";
import {
  getPeriodRange,
  isDateInRange,
  PERIODS,
  startOfWeekMonday,
} from "../src/utils/periods.js";
import { createSubmitGuard } from "../src/utils/submit-guard.js";
import { matchChurchRoute } from "../src/modules/church/church-routes.js";
import { friendlyError } from "../src/utils/errors.js";

describe("FCFA formatting", () => {
  it("formats zero, thousands and millions", () => {
    expect(formatFcfa(0)).toContain("0");
    expect(formatFcfa(0)).toContain("FCFA");
    expect(formatFcfa(25000)).toMatch(/25/);
    expect(formatFcfa(25000)).toContain("FCFA");
    expect(formatFcfa(350500)).toMatch(/350/);
    expect(formatFcfa(1250000)).toMatch(/250/);
  });

  it("formats negatives without dropping the sign", () => {
    expect(formatFcfa(-350500)).toMatch(/350/);
    expect(formatFcfaSigned(-350500)).toMatch(/^−/);
  });

  it("keeps stored values as integers", () => {
    expect(toFcfaInteger("1 250 000")).toBe(1250000);
    expect(toFcfaInteger("25 000 FCFA")).toBe(25000);
    expect(toFcfaInteger(12.9)).toBe(12);
  });
});

describe("income and expense balance effect", () => {
  it("increases a fund after income", () => {
    const before = calculateChurchFundBalance({
      openingBalance: 100000,
      incomeTotal: 0,
      expenseTotal: 0,
    });
    const after = calculateChurchFundBalance({
      openingBalance: 100000,
      incomeTotal: 150000,
      expenseTotal: 0,
    });
    expect(after - before).toBe(150000);
    expect(after).toBe(250000);
  });

  it("decreases a fund after expense", () => {
    const before = calculateChurchFundBalance({
      openingBalance: 200000,
      incomeTotal: 0,
      expenseTotal: 0,
    });
    const after = calculateChurchFundBalance({
      openingBalance: 200000,
      incomeTotal: 0,
      expenseTotal: 75000,
    });
    expect(before - after).toBe(75000);
    expect(after).toBe(125000);
  });

  it("allows a negative resulting balance", () => {
    const expected = calculateExpectedBalance(100000, 150000, "expense");
    expect(expected).toBe(-50000);
    expect(wouldMakeNegativeBalance(100000, 150000)).toBe(true);
    expect(
      calculateChurchFundBalance({
        openingBalance: 100000,
        incomeTotal: 0,
        expenseTotal: 150000,
      }),
    ).toBe(-50000);
  });
});

describe("reconciliation", () => {
  it("marks a balanced cash count", () => {
    const difference = calculateReconciliationDifference({
      theoreticalBalance: 1600500,
      actualBalance: 1600500,
    });
    expect(difference).toBe(0);
    expect(classifyReconciliation(difference)).toEqual({
      status: "balanced",
      absoluteDifference: 0,
    });
  });

  it("marks missing cash", () => {
    const difference = calculateReconciliationDifference({
      theoreticalBalance: 1600500,
      actualBalance: 1250000,
    });
    expect(difference).toBe(-350500);
    expect(classifyReconciliation(difference)).toEqual({
      status: "shortage",
      absoluteDifference: 350500,
    });
  });

  it("marks excess cash", () => {
    const difference = calculateReconciliationDifference({
      theoreticalBalance: 100000,
      actualBalance: 125000,
    });
    expect(difference).toBe(25000);
    expect(classifyReconciliation(difference)).toEqual({
      status: "surplus",
      absoluteDifference: 25000,
    });
  });
});

describe("date period filtering", () => {
  const now = new Date(2026, 8, 2); // Wednesday 2 September 2026

  it("uses Monday-start weeks on the local calendar", () => {
    const monday = startOfWeekMonday(now);
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(7);
    expect(monday.getDate()).toBe(31);
    expect(getPeriodRange(PERIODS.week, { now })).toEqual({
      from: "2026-08-31",
      to: "2026-09-06",
    });
  });

  it("builds today / month / year ranges without UTC shift", () => {
    expect(getPeriodRange(PERIODS.today, { now })).toEqual({
      from: "2026-09-02",
      to: "2026-09-02",
    });
    expect(getPeriodRange(PERIODS.month, { now })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(getPeriodRange(PERIODS.year, { now })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("filters transactions by period, fund and type", () => {
    const rows = [
      { id: "1", transaction_date: "2026-09-02", fund_id: "ord", transaction_type: "income" },
      { id: "2", transaction_date: "2026-08-15", fund_id: "ord", transaction_type: "expense" },
      { id: "3", transaction_date: "2026-09-03", fund_id: "wrk", transaction_type: "income" },
    ];
    const month = getPeriodRange(PERIODS.month, { now });
    expect(filterTransactions(rows, month).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterTransactions(rows, { ...month, fundId: "ord" }).map((r) => r.id)).toEqual(["1"]);
    expect(
      filterTransactions(rows, { type: "expense" }).map((r) => r.id),
    ).toEqual(["2"]);
    expect(isDateInRange("2026-09-01", "2026-09-01", "2026-09-30")).toBe(true);
    expect(isDateInRange("2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
  });

  it("parses YYYY-MM-DD as a local date", () => {
    const d = parseLocalDate("2026-09-02");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(2);
    expect(formatLongDateFr("2026-09-02")).toBe("2 septembre 2026");
  });
});

describe("transaction validation", () => {
  it("accepts a complete income", () => {
    const result = validateChurchTransaction({
      fundId: "fund-1",
      type: "income",
      amount: "150 000",
      date: "2026-09-02",
      reason: "Offrandes dimanche",
    });
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(150000);
  });

  it("rejects empty reason, zero amount and missing fund", () => {
    const result = validateChurchTransaction({
      fundId: "",
      type: "expense",
      amount: 0,
      date: "",
      reason: "   ",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.fundId).toBeTruthy();
    expect(result.errors.amount).toBeTruthy();
    expect(result.errors.date).toBeTruthy();
    expect(result.errors.reason).toBeTruthy();
  });
});

describe("duplicate-submit protection", () => {
  it("skips a second run while the first is pending", async () => {
    const guard = createSubmitGuard();
    let runs = 0;
    const first = guard.run(async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "ok";
    });
    const second = guard.run(async () => {
      runs += 1;
      return "nope";
    });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ skipped: false, result: "ok" });
    expect(b).toEqual({ skipped: true });
    expect(runs).toBe(1);
    expect(guard.isLocked()).toBe(false);
  });
});

describe("report totals and fund separation", () => {
  const ordinary = { id: "ord", name: "Ordinaire" };
  const works = { id: "wrk", name: "Travaux" };
  const transactions = [
    { fund_id: "ord", transaction_type: "income", amount_fcfa: 500000, transaction_date: "2026-09-01" },
    { fund_id: "ord", transaction_type: "expense", amount_fcfa: 50000, transaction_date: "2026-09-02" },
    { fund_id: "wrk", transaction_type: "income", amount_fcfa: 325000, transaction_date: "2026-09-03" },
    { fund_id: "wrk", transaction_type: "expense", amount_fcfa: 165000, transaction_date: "2026-09-04" },
  ];

  it("computes period totals", () => {
    const totals = calculatePeriodTotals(transactions);
    expect(totals.incomeTotal).toBe(825000);
    expect(totals.expenseTotal).toBe(215000);
    expect(totals.netMovement).toBe(610000);
    expect(calculateNetMovement(825000, 215000)).toBe(610000);
  });

  it("keeps ordinary and works funds separate", () => {
    const byFund = calculateTotalsByFund(transactions, [ordinary, works]);
    expect(byFund[0].incomeTotal).toBe(500000);
    expect(byFund[0].expenseTotal).toBe(50000);
    expect(byFund[1].incomeTotal).toBe(325000);
    expect(byFund[1].expenseTotal).toBe(165000);
    expect(calculateCombinedChurchBalance([
      { openingBalance: 0, incomeTotal: 500000, expenseTotal: 50000 },
      { openingBalance: 0, incomeTotal: 325000, expenseTotal: 165000 },
    ])).toBe(610000);
  });

  it("groups transactions by month", () => {
    const groups = groupTransactionsByPeriod(
      [
        ...transactions,
        { fund_id: "ord", transaction_type: "income", amount_fcfa: 1000, transaction_date: "2026-08-01" },
      ],
      "month",
    );
    expect(groups[0].key).toBe("2026-09");
    expect(groups[0].incomeTotal).toBe(825000);
    expect(groups[1].key).toBe("2026-08");
    expect(groups[1].incomeTotal).toBe(1000);
  });
});

describe("church routes", () => {
  it("parses church sub-routes", () => {
    expect(matchChurchRoute("/eglise")).toEqual({ name: "dashboard" });
    expect(matchChurchRoute("/eglise/entree")).toEqual({ name: "income" });
    expect(matchChurchRoute("/eglise/sortie")).toEqual({ name: "expense" });
    expect(matchChurchRoute("/eglise/historique")).toEqual({ name: "history" });
    expect(matchChurchRoute("/eglise/operation/abc")).toEqual({
      name: "detail",
      id: "abc",
    });
    expect(matchChurchRoute("/eglise/operation/abc/modifier")).toEqual({
      name: "edit",
      id: "abc",
    });
    expect(matchChurchRoute("/eglise/rapprochement")).toEqual({
      name: "reconciliation",
    });
    expect(matchChurchRoute("/eglise/rapport")).toEqual({ name: "report" });
  });
});

describe("network error copy", () => {
  it("does not expose raw internals", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe(
      "Connexion indisponible. L'opération n'a pas été enregistrée.",
    );
    expect(friendlyError(new Error("PGRST204 something"))).not.toMatch(/PGRST/);
  });
});
