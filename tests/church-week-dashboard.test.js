import { describe, expect, it } from "vitest";
import { seriesHasActivity } from "../src/utils/charts-data.js";
import {
  buildChurchWeekSeries,
  calculateChurchFundBalance,
  calculateCombinedChurchBalance,
  calculatePeriodTotals,
  calculateReconciliationDifference,
  classifyReconciliation,
  filterTransactions,
} from "../src/utils/church-calc.js";
import { calendarDateInTimeZone } from "../src/utils/dates.js";
import { toFcfaInteger } from "../src/utils/money.js";
import { dateKey, getPeriodRange, getWeekRangeInAppZone, isDateInRange, PERIODS } from "../src/utils/periods.js";
import {
  CHURCH_LINKS,
  churchHistoryRowHtml,
  churchHomeHtml,
  churchReportMetricsHtml,
} from "../src/modules/church/church-ui.js";

const WEEK = { from: "2026-09-07", to: "2026-09-13" };

function tx(overrides) {
  return {
    fund_id: "ord",
    transaction_type: "income",
    amount_fcfa: 0,
    transaction_date: "2026-09-09",
    ...overrides,
  };
}

function chartFrom(rows, range = WEEK) {
  return buildChurchWeekSeries(rows, range);
}

function summaryFrom(rows, range = WEEK) {
  return calculatePeriodTotals(filterTransactions(rows, range));
}

describe("Church week range — Africa/Douala", () => {
  it("keeps Sunday 23:30 Douala in the current Monday–Sunday week", () => {
    const sundayNight = new Date("2026-09-13T22:30:00.000Z");
    const cal = calendarDateInTimeZone(sundayNight);
    expect(cal.getFullYear()).toBe(2026);
    expect(cal.getMonth()).toBe(8);
    expect(cal.getDate()).toBe(13);
    expect(getWeekRangeInAppZone(sundayNight)).toEqual(WEEK);
  });

  it("opens the next week after Monday 00:00 Douala", () => {
    const mondayEarly = new Date("2026-09-13T23:30:00.000Z");
    expect(getWeekRangeInAppZone(mondayEarly)).toEqual({
      from: "2026-09-14",
      to: "2026-09-20",
    });
  });

  it("does not invent a weekly delete job — range is display-only", () => {
    expect(getWeekRangeInAppZone(new Date("2026-09-09T10:00:00.000Z"))).toEqual(WEEK);
    expect(getPeriodRange(PERIODS.week, { now: new Date(2026, 8, 9) })).toEqual(WEEK);
  });
});

describe("date keys keep Sunday timestamps inside the week", () => {
  it("normalizes timestamptz to YYYY-MM-DD before comparing", () => {
    expect(dateKey("2026-09-13T23:59:59.000Z")).toBe("2026-09-13");
    expect(isDateInRange("2026-09-13T18:00:00+01:00", WEEK.from, WEEK.to)).toBe(true);
    expect(isDateInRange("2026-09-14T00:00:00.000Z", WEEK.from, WEEK.to)).toBe(false);
  });
});

describe("controlled Church week + balances", () => {
  it("matches the 100000 / 50000 / 20000 then +10000 scenario", () => {
    const first = [
      tx({ fund_id: "ord", transaction_type: "income", amount_fcfa: 100000, transaction_date: "2026-09-13" }),
      tx({ fund_id: "wrk", transaction_type: "income", amount_fcfa: 50000, transaction_date: "2026-09-13" }),
      tx({ fund_id: "ord", transaction_type: "expense", amount_fcfa: 20000, transaction_date: "2026-09-09" }),
    ];

    const weekly = summaryFrom(first);
    expect(weekly.incomeTotal).toBe(150000);
    expect(weekly.expenseTotal).toBe(20000);
    expect(weekly.netMovement).toBe(130000);

    const ordinary = calculateChurchFundBalance({
      openingBalance: 0,
      incomeTotal: 100000,
      expenseTotal: 20000,
    });
    const works = calculateChurchFundBalance({
      openingBalance: 0,
      incomeTotal: 50000,
      expenseTotal: 0,
    });
    expect(ordinary).toBe(80000);
    expect(works).toBe(50000);
    expect(calculateCombinedChurchBalance([
      { openingBalance: 0, incomeTotal: 100000, expenseTotal: 20000 },
      { openingBalance: 0, incomeTotal: 50000, expenseTotal: 0 },
    ])).toBe(130000);

    const chart = chartFrom(first);
    expect(chart.incomeValues[6]).toBe(150000);
    expect(chart.expenseValues[2]).toBe(20000);
    expect(chart.totals).toEqual(weekly);

    const afterTravauxExpense = [
      ...first,
      tx({ fund_id: "wrk", transaction_type: "expense", amount_fcfa: 10000, transaction_date: "2026-09-11" }),
    ];
    const weekly2 = summaryFrom(afterTravauxExpense);
    expect(weekly2.incomeTotal).toBe(150000);
    expect(weekly2.expenseTotal).toBe(30000);
    expect(weekly2.netMovement).toBe(120000);

    const works2 = calculateChurchFundBalance({
      openingBalance: 0,
      incomeTotal: 50000,
      expenseTotal: 10000,
    });
    expect(works2).toBe(40000);
    expect(calculateCombinedChurchBalance([
      { openingBalance: 0, incomeTotal: 100000, expenseTotal: 20000 },
      { openingBalance: 0, incomeTotal: 50000, expenseTotal: 10000 },
    ])).toBe(120000);

    const chart2 = chartFrom(afterTravauxExpense);
    expect(chart2.expenseValues[4]).toBe(10000);
    expect(chart2.totals).toEqual(weekly2);
  });
});

describe("Church chart regression", () => {
  it("adds a new income to the chart on the correct weekday", () => {
    const before = chartFrom([]);
    expect(before.incomeValues).toEqual([0, 0, 0, 0, 0, 0, 0]);
    const after = chartFrom([
      tx({ transaction_type: "income", amount_fcfa: 75000, transaction_date: "2026-09-08" }),
    ]);
    expect(after.incomeValues[1]).toBe(75000);
    expect(after.totals.incomeTotal).toBe(75000);
  });

  it("adds a new expense to the chart on the correct weekday", () => {
    const before = chartFrom([
      tx({ transaction_type: "income", amount_fcfa: 75000, transaction_date: "2026-09-08" }),
    ]);
    const after = chartFrom([
      tx({ transaction_type: "income", amount_fcfa: 75000, transaction_date: "2026-09-08" }),
      tx({ transaction_type: "expense", amount_fcfa: 15000, transaction_date: "2026-09-10" }),
    ]);
    expect(after.expenseValues[3]).toBe(15000);
    expect(after.totals.expenseTotal).toBe(before.totals.expenseTotal + 15000);
  });

  it("includes every current-week transaction and ignores other weeks", () => {
    const rows = [
      tx({ transaction_type: "income", amount_fcfa: 10000, transaction_date: "2026-09-07" }),
      tx({ transaction_type: "expense", amount_fcfa: 3000, transaction_date: "2026-09-13T21:00:00.000Z" }),
      tx({ transaction_type: "income", amount_fcfa: 99999, transaction_date: "2026-09-06" }),
      tx({ transaction_type: "expense", amount_fcfa: 88888, transaction_date: "2026-09-14" }),
    ];
    const chart = chartFrom(rows);
    expect(chart.incomeValues[0]).toBe(10000);
    expect(chart.expenseValues[6]).toBe(3000);
    expect(chart.totals.incomeTotal).toBe(10000);
    expect(chart.totals.expenseTotal).toBe(3000);
    expect(chart.totals.netMovement).toBe(7000);
  });

  it("keeps chart series and weekly summary cards identical", () => {
    const rows = [
      tx({ fund_id: "ord", transaction_type: "income", amount_fcfa: 40000, transaction_date: "2026-09-07" }),
      tx({ fund_id: "wrk", transaction_type: "income", amount_fcfa: 25000, transaction_date: "2026-09-12" }),
      tx({ fund_id: "ord", transaction_type: "expense", amount_fcfa: 12000, transaction_date: "2026-09-09" }),
      tx({ fund_id: "wrk", transaction_type: "expense", amount_fcfa: 8000, transaction_date: "2026-09-13" }),
    ];
    const chart = chartFrom(rows);
    const cards = summaryFrom(rows);
    expect(chart.incomeValues.reduce((sum, n) => sum + n, 0)).toBe(cards.incomeTotal);
    expect(chart.expenseValues.reduce((sum, n) => sum + n, 0)).toBe(cards.expenseTotal);
    expect(chart.totals).toEqual(cards);
  });

  it("renders an empty/zero chart when there are no operations", () => {
    const chart = chartFrom([]);
    expect(chart.incomeValues).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(chart.expenseValues).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(chart.totals).toEqual({ incomeTotal: 0, expenseTotal: 0, netMovement: 0 });
    expect(seriesHasActivity([
      { values: chart.incomeValues },
      { values: chart.expenseValues },
    ])).toBe(false);
  });

  it("never treats weekly net as the cumulative church total", () => {
    const history = [
      tx({ transaction_type: "income", amount_fcfa: 500000, transaction_date: "2026-08-30" }),
      tx({ transaction_type: "income", amount_fcfa: 150000, transaction_date: "2026-09-13" }),
      tx({ transaction_type: "expense", amount_fcfa: 30000, transaction_date: "2026-09-09" }),
    ];
    const weekly = summaryFrom(history);
    const current = calculateChurchFundBalance({
      openingBalance: 0,
      incomeTotal: 650000,
      expenseTotal: 30000,
    });
    expect(weekly.netMovement).toBe(120000);
    expect(current).toBe(620000);
    expect(weekly.netMovement).not.toBe(current);
  });
});

describe("Church home markup", () => {
  const html = churchHomeHtml({
    funds: [
      { id: "ord", name: "Ordinaire", balance: 400000 },
      { id: "wrk", name: "Travaux", balance: 250000 },
    ],
    total: 650000,
    weekly: { incomeTotal: 170000, expenseTotal: 20000, netMovement: 150000 },
    week: WEEK,
  });

  it("shows weekly flow, cumulative total, and History click-through", () => {
    expect(html).toContain("Entrées de la semaine");
    expect(html).toContain("Sorties");
    expect(html).toContain("Solde de la semaine");
    expect(html).toContain("Solde actuel total");
    expect(html).toContain("#/eglise/historique?period=week&type=income");
    expect(html).toContain("#/eglise/historique?period=week&type=expense");
    expect(html).toMatch(/170[\s\u00A0\u202F]?000/);
    expect(html).toMatch(/650[\s\u00A0\u202F]?000/);
    expect(html).not.toContain("Mouvement du mois");
    expect(html).not.toContain("Ordinaire");
    expect(html).not.toContain("Travaux");
  });

  it("places actions before the total and the graph", () => {
    const incomeAt = html.indexOf("Entrées de la semaine");
    const sortiesAt = html.indexOf("Sorties");
    const weekNetAt = html.indexOf("Solde de la semaine");
    const actionsAt = html.indexOf("Enregistrer une entrée");
    const totalAt = html.indexOf("Solde actuel total");
    const chartAt = html.indexOf("Mouvement de la semaine");
    expect(incomeAt).toBeGreaterThan(-1);
    expect(incomeAt).toBeLessThan(sortiesAt);
    expect(sortiesAt).toBeLessThan(weekNetAt);
    expect(weekNetAt).toBeLessThan(actionsAt);
    expect(actionsAt).toBeLessThan(totalAt);
    expect(totalAt).toBeLessThan(chartAt);
    expect(html).toContain("Enregistrer une sortie");
    expect(html).toContain("Vérifier la caisse");
  });
});

describe("Church History income/expense styling", () => {
  it("marks income with + and the positive class from the transaction type", () => {
    const html = churchHistoryRowHtml({
      id: "in-1",
      transaction_type: "income",
      amount_fcfa: 85000,
      reason: "Quête dimanche",
      transaction_date: "2026-09-13",
      church_funds: { name: "Ordinaire" },
    });
    expect(html).toContain("Quête dimanche");
    expect(html).toContain("amount-positive");
    expect(html).toMatch(/\+\s*85[\s\u00A0\u202F]?000/);
    expect(html).not.toContain("amount-negative");
  });

  it("marks expense with − and the negative class even when the stored amount is positive", () => {
    const html = churchHistoryRowHtml({
      id: "out-1",
      transaction_type: "expense",
      amount_fcfa: 1500,
      reason: "Achat d'eau",
      transaction_date: "2026-09-13",
      church_funds: { name: "Ordinaire" },
    });
    expect(html).toContain("Achat d&#39;eau");
    expect(html).toContain("amount-negative");
    expect(html).toMatch(/−\s*1[\s\u00A0\u202F]?500/);
    expect(html).not.toMatch(/\+\s*1[\s\u00A0\u202F]?500/);
  });
});

describe("Church report metric rows", () => {
  it("keeps each label with its value on the same row", () => {
    const html = churchReportMetricsHtml({
      incomeTotal: 0,
      expenseTotal: 1500,
      netMovement: -1500,
    });
    expect(html).toMatch(/<span>Entrées<\/span>\s*<strong>0\s*FCFA<\/strong>/);
    expect(html).toMatch(/<span>Sorties<\/span>\s*<strong>1[\s\u00A0\u202F]?500\s*FCFA<\/strong>/);
    expect(html).toMatch(/<span>Variation<\/span>\s*<strong class="amount-negative">−1[\s\u00A0\u202F]?500\s*FCFA<\/strong>/);
  });
});

describe("Church History week filters", () => {
  it("reuses the existing History routes with week + type", () => {
    expect(CHURCH_LINKS.weekIncome).toBe("/eglise/historique?period=week&type=income");
    expect(CHURCH_LINKS.weekExpense).toBe("/eglise/historique?period=week&type=expense");
    expect(CHURCH_LINKS.history).toBe("/eglise/historique");
  });
});

describe("Church money stays integer FCFA", () => {
  it("truncates fractional input and keeps reconciliation integer", () => {
    const totals = calculatePeriodTotals([
      { transaction_type: "income", amount_fcfa: 100000.9 },
      { transaction_type: "expense", amount_fcfa: "20 000,4" },
    ]);
    expect(Number.isInteger(totals.incomeTotal)).toBe(true);
    expect(Number.isInteger(totals.expenseTotal)).toBe(true);
    expect(totals.incomeTotal).toBe(100000);
    expect(totals.expenseTotal).toBe(20000);
    expect(toFcfaInteger(12.9)).toBe(12);

    const difference = calculateReconciliationDifference({
      theoreticalBalance: 80000,
      actualBalance: 79500,
    });
    expect(difference).toBe(-500);
    expect(classifyReconciliation(difference)).toEqual({
      status: "shortage",
      absoluteDifference: 500,
    });
  });
});
