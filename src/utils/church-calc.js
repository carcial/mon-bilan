/**
 * Pure church financial calculations (integer FCFA).
 */

import { toFcfaInteger } from "./money.js";
import { isDateInRange } from "./periods.js";

/**
 * balance = opening + income - expenses
 * @param {{ openingBalance: number, incomeTotal: number, expenseTotal: number }} input
 */
export function calculateChurchFundBalance({
  openingBalance = 0,
  incomeTotal = 0,
  expenseTotal = 0,
}) {
  return (
    toFcfaInteger(openingBalance) +
    toFcfaInteger(incomeTotal) -
    toFcfaInteger(expenseTotal)
  );
}

/**
 * Combined church balance across funds only (never includes business).
 * @param {Array<{ openingBalance: number, incomeTotal: number, expenseTotal: number }>} funds
 */
export function calculateCombinedChurchBalance(funds = []) {
  return funds.reduce(
    (sum, fund) => sum + calculateChurchFundBalance(fund),
    0,
  );
}

/**
 * actual - theoretical
 * @param {{ theoreticalBalance: number, actualBalance: number }} input
 */
export function calculateReconciliationDifference({
  theoreticalBalance,
  actualBalance,
}) {
  return toFcfaInteger(actualBalance) - toFcfaInteger(theoreticalBalance);
}

/**
 * @param {number} difference actual - theoretical
 * @returns {{ status: 'balanced' | 'shortage' | 'surplus', absoluteDifference: number }}
 */
export function classifyReconciliation(difference) {
  const d = toFcfaInteger(difference);
  if (d === 0) {
    return { status: "balanced", absoluteDifference: 0 };
  }
  if (d < 0) {
    return { status: "shortage", absoluteDifference: Math.abs(d) };
  }
  return { status: "surplus", absoluteDifference: d };
}

/**
 * @param {number} currentBalance
 * @param {number} amount
 * @param {'income' | 'expense'} type
 */
export function calculateExpectedBalance(currentBalance, amount, type) {
  const current = toFcfaInteger(currentBalance);
  const n = toFcfaInteger(amount);
  return type === "expense" ? current - n : current + n;
}

export function wouldMakeNegativeBalance(currentBalance, expenseAmount) {
  return calculateExpectedBalance(currentBalance, expenseAmount, "expense") < 0;
}

export function calculateNetMovement(incomeTotal, expenseTotal) {
  return toFcfaInteger(incomeTotal) - toFcfaInteger(expenseTotal);
}

/**
 * @param {Array<{ transaction_type?: string, type?: string, amount_fcfa?: number, amount?: number }>} transactions
 */
export function calculatePeriodTotals(transactions = []) {
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const tx of transactions) {
    const type = tx.transaction_type ?? tx.type;
    const amount = toFcfaInteger(tx.amount_fcfa ?? tx.amount);
    if (type === "income") incomeTotal += amount;
    else if (type === "expense") expenseTotal += amount;
  }

  return {
    incomeTotal,
    expenseTotal,
    netMovement: calculateNetMovement(incomeTotal, expenseTotal),
  };
}

/**
 * @param {Array<{ fund_id: string, transaction_type: string, amount_fcfa: number }>} transactions
 * @param {Array<{ id: string }>} funds
 */
export function calculateTotalsByFund(transactions = [], funds = []) {
  return funds.map((fund) => {
    const rows = transactions.filter((tx) => tx.fund_id === fund.id);
    return { fund, ...calculatePeriodTotals(rows) };
  });
}

/**
 * @param {Array<{ transaction_date: string, fund_id?: string, transaction_type?: string }>} transactions
 * @param {{ from?: string | null, to?: string | null, fundId?: string | null, type?: string | null }} filters
 */
export function filterTransactions(transactions = [], filters = {}) {
  const { from = null, to = null, fundId = null, type = null } = filters;
  return transactions.filter((tx) => {
    if (!isDateInRange(tx.transaction_date, from, to)) return false;
    if (fundId && tx.fund_id !== fundId) return false;
    if (type && tx.transaction_type !== type) return false;
    return true;
  });
}

/**
 * @param {Array<{ transaction_date: string, transaction_type?: string, amount_fcfa?: number }>} transactions
 * @param {'day' | 'month' | 'year'} groupBy
 */
export function groupTransactionsByPeriod(transactions = [], groupBy = "month") {
  const groups = new Map();

  for (const tx of transactions) {
    const date = tx.transaction_date || "";
    let key = date;
    if (groupBy === "month") key = date.slice(0, 7);
    else if (groupBy === "year") key = date.slice(0, 4);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      items,
      ...calculatePeriodTotals(items),
    }));
}

/**
 * @param {{
 *   fundId?: string,
 *   amount?: unknown,
 *   date?: string,
 *   reason?: string,
 *   type?: string,
 * }} input
 * @returns {{ ok: boolean, errors: Record<string, string>, amount: number, reason: string, note?: string }}
 */
export function validateChurchTransaction(input = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const type = input.type;
  const fundId = String(input.fundId || "").trim();
  const date = String(input.date || "").trim();
  const reason = String(input.reason || "").trim();
  const amount = toFcfaInteger(input.amount);

  if (!fundId) errors.fundId = "Choisissez une caisse.";
  if (type !== "income" && type !== "expense") {
    errors.type = "Type d'opération invalide.";
  }
  if (amount <= 0) errors.amount = "Le montant doit être supérieur à 0.";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = "Indiquez une date.";
  }
  if (!reason) errors.reason = "Indiquez le motif.";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    amount,
    reason,
  };
}
