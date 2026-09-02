/**
 * Church data access — reads and confirmed writes.
 * Balance figures come from canonical RPCs, never from a parallel frontend ledger.
 */

import { getSupabase, getSupabaseOrThrow } from "./client.js";
import { recordAuditEvent, recordAuditEventSafe } from "./audit.js";
import { calculatePeriodTotals, calculateTotalsByFund } from "../../utils/church-calc.js";

const TX_SELECT =
  "id, fund_id, transaction_type, amount_fcfa, transaction_date, reason, note, created_at, updated_at, church_funds ( id, code, name )";

const RECON_SELECT =
  "id, fund_id, theoretical_balance_fcfa, actual_cash_fcfa, difference_fcfa, note, reconciled_at, created_at, church_funds ( id, code, name )";

export async function fetchChurchFunds() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("church_funds")
    .select("id, code, name, description, opening_balance_fcfa, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getChurchFunds() {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("church_funds")
    .select("id, code, name, description, opening_balance_fcfa, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Combined current church balance across funds (never includes business).
 * Phase 1: returns null when not configured / no data yet.
 */
export async function fetchCombinedChurchBalance() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.rpc("church_combined_balance");
  if (error) {
    console.warn("[church] balance RPC unavailable:", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

/**
 * @param {string} fundId
 * @param {string | null} [asOf] YYYY-MM-DD
 */
export async function getChurchFundBalance(fundId, asOf = null) {
  const sb = getSupabaseOrThrow();
  const args = asOf
    ? { p_fund_id: fundId, p_as_of: asOf }
    : { p_fund_id: fundId };
  const { data, error } = await sb.rpc("church_fund_balance", args);
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/**
 * @param {string | null} [asOf] YYYY-MM-DD
 */
export async function getCombinedChurchBalance(asOf = null) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb.rpc(
    "church_combined_balance",
    asOf ? { p_as_of: asOf } : {},
  );
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/**
 * Canonical balances from RPCs + fund rows.
 * @param {string | null} [asOf]
 */
export async function getChurchBalances(asOf = null) {
  const funds = await getChurchFunds();
  const withBalances = await Promise.all(
    funds.map(async (fund) => ({
      ...fund,
      balance: await getChurchFundBalance(fund.id, asOf),
    })),
  );
  const total = await getCombinedChurchBalance(asOf);
  return { funds: withBalances, total };
}

/**
 * @param {{
 *   from?: string | null,
 *   to?: string | null,
 *   fundId?: string | null,
 *   type?: 'income' | 'expense' | null,
 *   limit?: number,
 * }} [filters]
 */
export async function getChurchTransactions(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("church_transactions")
    .select(TX_SELECT)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.from) query = query.gte("transaction_date", filters.from);
  if (filters.to) query = query.lte("transaction_date", filters.to);
  if (filters.fundId) query = query.eq("fund_id", filters.fundId);
  if (filters.type) query = query.eq("transaction_type", filters.type);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getChurchTransaction(id) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("church_transactions")
    .select(TX_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * @param {{
 *   fundId: string,
 *   type: 'income' | 'expense',
 *   amountFcfa: number,
 *   date: string,
 *   reason: string,
 *   note?: string | null,
 * }} input
 */
export async function createChurchTransaction(input) {
  const sb = getSupabaseOrThrow();
  const payload = {
    fund_id: input.fundId,
    transaction_type: input.type,
    amount_fcfa: input.amountFcfa,
    transaction_date: input.date,
    reason: String(input.reason || "").trim(),
    note: input.note ? String(input.note).trim() : null,
  };
  const { data, error } = await sb
    .from("church_transactions")
    .insert(payload)
    .select(TX_SELECT)
    .single();
  if (error) throw error;

  await recordAuditEventSafe({
    entityTable: "church_transactions",
    entityId: data.id,
    action: "insert",
    newValues: snapshotTransaction(data),
  });

  return data;
}

/**
 * @param {string} id
 * @param {{
 *   fundId: string,
 *   type: 'income' | 'expense',
 *   amountFcfa: number,
 *   date: string,
 *   reason: string,
 *   note?: string | null,
 * }} input
 */
export async function updateChurchTransaction(id, input) {
  const existing = await getChurchTransaction(id);
  if (!existing) throw new Error("Opération introuvable.");

  const sb = getSupabaseOrThrow();
  const payload = {
    fund_id: input.fundId,
    transaction_type: input.type,
    amount_fcfa: input.amountFcfa,
    transaction_date: input.date,
    reason: String(input.reason || "").trim(),
    note: input.note ? String(input.note).trim() : null,
  };

  const { data, error } = await sb
    .from("church_transactions")
    .update(payload)
    .eq("id", id)
    .select(TX_SELECT)
    .single();
  if (error) throw error;

  const audited = await recordAuditEventSafe({
    entityTable: "church_transactions",
    entityId: data.id,
    action: "update",
    previousValues: snapshotTransaction(existing),
    newValues: snapshotTransaction(data),
  });
  if (!audited) {
    console.warn("[church] update saved but audit trail failed", id);
  }

  return data;
}

export async function deleteChurchTransaction(id) {
  const existing = await getChurchTransaction(id);
  if (!existing) throw new Error("Opération introuvable.");

  await recordAuditEvent({
    entityTable: "church_transactions",
    entityId: existing.id,
    action: "delete",
    previousValues: snapshotTransaction(existing),
  });

  const sb = getSupabaseOrThrow();
  const { error } = await sb.from("church_transactions").delete().eq("id", id);
  if (error) throw error;
  return existing;
}

/**
 * @param {{
 *   fundId?: string | null,
 *   theoreticalBalance: number,
 *   actualCash: number,
 *   difference: number,
 *   note?: string | null,
 *   reconciledAt?: string,
 * }} input
 */
export async function createReconciliation(input) {
  const sb = getSupabaseOrThrow();
  const payload = {
    fund_id: input.fundId || null,
    theoretical_balance_fcfa: input.theoreticalBalance,
    actual_cash_fcfa: input.actualCash,
    difference_fcfa: input.difference,
    note: input.note ? String(input.note).trim() : null,
  };
  if (input.reconciledAt) payload.reconciled_at = input.reconciledAt;

  const { data, error } = await sb
    .from("church_reconciliations")
    .insert(payload)
    .select(RECON_SELECT)
    .single();
  if (error) throw error;

  await recordAuditEventSafe({
    entityTable: "church_reconciliations",
    entityId: data.id,
    action: "insert",
    newValues: snapshotReconciliation(data),
  });

  return data;
}

/**
 * @param {{ fundId?: string | null, limit?: number }} [filters]
 */
export async function getReconciliations(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("church_reconciliations")
    .select(RECON_SELECT)
    .order("reconciled_at", { ascending: false });

  if (filters.fundId === null) {
    query = query.is("fund_id", null);
  } else if (filters.fundId) {
    query = query.eq("fund_id", filters.fundId);
  }
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Period report: movement from transactions + ending balances from RPCs.
 * @param {{ from: string | null, to: string | null }} range
 */
export async function getChurchReport(range) {
  const [funds, transactions, ending] = await Promise.all([
    getChurchFunds(),
    getChurchTransactions({ from: range.from, to: range.to }),
    getChurchBalances(range.to),
  ]);

  const totals = calculatePeriodTotals(transactions);
  const byFund = calculateTotalsByFund(transactions, funds).map((row) => {
    const endingFund = ending.funds.find((f) => f.id === row.fund.id);
    return {
      ...row,
      endingBalance: endingFund?.balance ?? 0,
    };
  });

  return {
    funds,
    transactions,
    totals,
    byFund,
    endingTotal: ending.total,
    endingFunds: ending.funds,
  };
}

function snapshotTransaction(row) {
  return {
    id: row.id,
    fund_id: row.fund_id,
    transaction_type: row.transaction_type,
    amount_fcfa: row.amount_fcfa,
    transaction_date: row.transaction_date,
    reason: row.reason,
    note: row.note,
    fund_name: row.church_funds?.name ?? null,
  };
}

function snapshotReconciliation(row) {
  return {
    id: row.id,
    fund_id: row.fund_id,
    theoretical_balance_fcfa: row.theoretical_balance_fcfa,
    actual_cash_fcfa: row.actual_cash_fcfa,
    difference_fcfa: row.difference_fcfa,
    note: row.note,
    reconciled_at: row.reconciled_at,
  };
}
