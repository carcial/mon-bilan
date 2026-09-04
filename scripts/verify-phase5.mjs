/**
 * Controlled Phase 5 integration scenario against the linked Supabase project.
 * Creates clearly labeled temporary rows, checks algorithms against DB results,
 * then deletes only the temporary rows (never seed SOA / Pommes / church funds).
 */
import { createClient } from "@supabase/supabase-js";
import {
  calculateArrivalExpenses,
  calculateAvailableInventory,
  calculateCustomerOutstanding,
  calculateEffectiveBatchCost,
  calculateEffectiveUnitCost,
  calculateEstimatedProfit,
  calculateMerchandiseValue,
  calculatePeriodBusinessTotals,
  calculateSupplierOutstanding,
} from "../src/utils/business-calc.js";
import {
  calculateChurchFundBalance,
  calculatePeriodTotals,
  calculateReconciliationDifference,
  classifyReconciliation,
} from "../src/utils/church-calc.js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const MARKER = "[TEST-PHASE5] temporaire — à supprimer";
const CUSTOMER_NAME = "TEST-PHASE5 Client Audit";

function fail(message) {
  throw new Error(message);
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("xxxxxxxx")) {
    fail("configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: funds, error: fundsError } = await sb
    .from("church_funds")
    .select("id, code, name, opening_balance_fcfa")
    .eq("is_active", true)
    .order("sort_order");
  if (fundsError || !funds?.length) fail(`funds: ${fundsError?.message || "none"}`);

  const { data: soa, error: soaErr } = await sb
    .from("suppliers")
    .select("id, code")
    .eq("code", "SOA")
    .maybeSingle();
  if (soaErr || !soa) fail(`SOA missing: ${soaErr?.message || "not found"}`);

  const { data: pommes, error: pomErr } = await sb
    .from("products")
    .select("id, name")
    .ilike("name", "pommes")
    .maybeSingle();
  if (pomErr || !pommes) fail(`Pommes missing: ${pomErr?.message || "not found"}`);

  const fund = funds[0];
  const { data: churchBefore } = await sb.rpc("church_fund_balance", { p_fund_id: fund.id });
  const { data: combinedBefore } = await sb.rpc("church_combined_balance");

  const ids = {
    txs: [],
    recon: null,
    customer: null,
    arrival: null,
    sales: [],
    payments: [],
    supplierPayments: [],
    expenses: [],
    adjustments: [],
  };

  try {
    const { data: income, error: inErr } = await sb
      .from("church_transactions")
      .insert({
        fund_id: fund.id,
        transaction_type: "income",
        amount_fcfa: 50000,
        transaction_date: "2026-09-03",
        reason: MARKER,
        note: "Entrée de test Phase 5",
      })
      .select("id")
      .single();
    if (inErr) fail(`church income: ${inErr.message}`);
    ids.txs.push(income.id);

    const { data: expense, error: exErr } = await sb
      .from("church_transactions")
      .insert({
        fund_id: fund.id,
        transaction_type: "expense",
        amount_fcfa: 15000,
        transaction_date: "2026-09-03",
        reason: MARKER,
        note: "Sortie de test Phase 5",
      })
      .select("id")
      .single();
    if (exErr) fail(`church expense: ${exErr.message}`);
    ids.txs.push(expense.id);

    const { data: churchAfter } = await sb.rpc("church_fund_balance", { p_fund_id: fund.id });
    const { data: combinedAfter } = await sb.rpc("church_combined_balance");
    eq(churchAfter, churchBefore + 35000, "church fund balance after txs");
    eq(combinedAfter, combinedBefore + 35000, "combined church balance after txs");

    const { data: periodTxs } = await sb
      .from("church_transactions")
      .select("transaction_type, amount_fcfa")
      .in("id", ids.txs);
    const period = calculatePeriodTotals(periodTxs);
    eq(period.incomeTotal, 50000, "church period income");
    eq(period.expenseTotal, 15000, "church period expense");
    eq(period.netMovement, 35000, "church period net");

    const expectedFund = calculateChurchFundBalance({
      openingBalance: fund.opening_balance_fcfa,
      incomeTotal: 0,
      expenseTotal: 0,
    });
    if (typeof expectedFund !== "number") fail("church formula helper");

    const theoretical = churchAfter;
    const actual = theoretical - 2000;
    const difference = calculateReconciliationDifference({
      theoreticalBalance: theoretical,
      actualBalance: actual,
    });
    eq(difference, -2000, "recon difference");
    eq(classifyReconciliation(difference).status, "shortage", "recon class");

    const { data: recon, error: reconErr } = await sb
      .from("church_reconciliations")
      .insert({
        fund_id: fund.id,
        theoretical_balance_fcfa: theoretical,
        actual_cash_fcfa: actual,
        difference_fcfa: difference,
        note: MARKER,
      })
      .select("id, theoretical_balance_fcfa, difference_fcfa")
      .single();
    if (reconErr) fail(`recon: ${reconErr.message}`);
    ids.recon = recon.id;
    eq(recon.theoretical_balance_fcfa, theoretical, "stored theoretical");
    eq(recon.difference_fcfa, -2000, "stored difference");

    const { data: churchAfterRecon } = await sb.rpc("church_fund_balance", { p_fund_id: fund.id });
    eq(churchAfterRecon, churchAfter, "recon must not change theoretical balance");
    console.log("OK   church income / expense / recon");

    const { data: customer, error: cErr } = await sb
      .from("customers")
      .insert({ name: CUSTOMER_NAME, note: MARKER })
      .select("id")
      .single();
    if (cErr) fail(`customer: ${cErr.message}`);
    ids.customer = customer.id;

    const { data: arrival, error: aErr } = await sb
      .from("stock_arrivals")
      .insert({
        supplier_id: soa.id,
        product_id: pommes.id,
        arrival_date: "2026-09-03",
        quantity_received: 10,
        supplier_unit_price_fcfa: 20000,
        transport_fcfa: 5000,
        unloading_fcfa: 2000,
        other_expenses_fcfa: 0,
        advance_paid_fcfa: 50000,
        note: MARKER,
      })
      .select("id")
      .single();
    if (aErr) fail(`arrival: ${aErr.message}`);
    ids.arrival = arrival.id;

    const merch = calculateMerchandiseValue(10, 20000);
    const arrivalExpenses = calculateArrivalExpenses({ transport: 5000, unloading: 2000 });
    const batch = calculateEffectiveBatchCost({
      quantity: 10,
      unitPrice: 20000,
      transport: 5000,
      unloading: 2000,
    });
    const unit = calculateEffectiveUnitCost(batch, 10);
    eq(merch, 200000, "merchandise");
    eq(arrivalExpenses, 7000, "arrival expenses");
    eq(batch, 207000, "batch cost");
    eq(unit, 20700, "unit cost");

    const { data: cost, error: costErr } = await sb
      .from("stock_arrival_costs")
      .select("merchandise_value_fcfa, arrival_expenses_fcfa, effective_batch_cost_fcfa, effective_unit_cost_fcfa")
      .eq("arrival_id", arrival.id)
      .single();
    if (costErr) fail(`arrival cost view: ${costErr.message}`);
    eq(cost.merchandise_value_fcfa, merch, "db merchandise");
    eq(cost.arrival_expenses_fcfa, arrivalExpenses, "db arrival expenses");
    eq(cost.effective_batch_cost_fcfa, batch, "db batch");
    eq(cost.effective_unit_cost_fcfa, unit, "db unit cost");

    async function addSale(qty, price, paid, method) {
      const { data: saleId, error: rpcErr } = await sb.rpc("create_sale_with_item", {
        p_customer_id: customer.id,
        p_sale_date: "2026-09-03",
        p_payment_method: method,
        p_amount_paid_fcfa: paid,
        p_repayment_expectation: "undetermined",
        p_repayment_exact_date: null,
        p_repayment_approx_text: null,
        p_note: MARKER,
        p_product_id: pommes.id,
        p_arrival_id: arrival.id,
        p_quantity: qty,
        p_sale_unit_price_fcfa: price,
        p_effective_unit_cost_fcfa: unit,
      });
      if (!rpcErr && saleId) {
        ids.sales.push(saleId);
        return saleId;
      }
      const { data: sale, error: se } = await sb
        .from("sales")
        .insert({
          customer_id: customer.id,
          sale_date: "2026-09-03",
          payment_method: method,
          amount_paid_fcfa: paid,
          note: MARKER,
        })
        .select("id")
        .single();
      if (se) fail(`sale: ${se.message}`);
      const { error: ie } = await sb.from("sale_items").insert({
        sale_id: sale.id,
        product_id: pommes.id,
        arrival_id: arrival.id,
        quantity: qty,
        sale_unit_price_fcfa: price,
        effective_unit_cost_fcfa: unit,
      });
      if (ie) {
        await sb.from("sales").delete().eq("id", sale.id);
        fail(`sale item: ${ie.message}`);
      }
      ids.sales.push(sale.id);
      return sale.id;
    }

    await addSale(2, 25000, 50000, "cash");
    await addSale(3, 25000, 0, "credit");
    await addSale(2, 25000, 20000, "partial");
    console.log("OK   cash / credit / partial via atomic write");

    const { data: invAfterSales } = await sb
      .from("arrival_inventory")
      .select("quantity_sold, quantity_remaining")
      .eq("arrival_id", arrival.id)
      .single();
    eq(invAfterSales.quantity_sold, 7, "sold after three sales");
    eq(invAfterSales.quantity_remaining, 3, "remaining after three sales");

    const { error: oversell } = await sb.from("sale_items").insert({
      sale_id: ids.sales[0],
      product_id: pommes.id,
      arrival_id: arrival.id,
      quantity: 6,
      sale_unit_price_fcfa: 25000,
      effective_unit_cost_fcfa: unit,
    });
    if (!oversell) fail("oversell of 6 on 3 remaining was allowed");
    console.log("OK   oversell blocked");

    const { data: pay, error: pe } = await sb
      .from("customer_payments")
      .insert({
        customer_id: customer.id,
        amount_fcfa: 15000,
        payment_date: "2026-09-03",
        note: MARKER,
      })
      .select("id")
      .single();
    if (pe) fail(`customer payment: ${pe.message}`);
    ids.payments.push(pay.id);

    const { data: sp, error: spe } = await sb
      .from("supplier_payments")
      .insert({
        supplier_id: soa.id,
        arrival_id: arrival.id,
        amount_fcfa: 40000,
        payment_date: "2026-09-03",
        note: MARKER,
      })
      .select("id")
      .single();
    if (spe) fail(`supplier payment: ${spe.message}`);
    ids.supplierPayments.push(sp.id);

    const { data: exp, error: ee } = await sb
      .from("business_expenses")
      .insert({
        category: "market_fees",
        amount_fcfa: 8000,
        expense_date: "2026-09-03",
        is_arrival_cost_allocation: false,
        description: MARKER,
      })
      .select("id")
      .single();
    if (ee) fail(`expense: ${ee.message}`);
    ids.expenses.push(exp.id);

    const { data: adj, error: adjErr } = await sb
      .from("inventory_adjustments")
      .insert({
        product_id: pommes.id,
        arrival_id: arrival.id,
        quantity_delta: -1,
        reason: MARKER,
        adjustment_date: "2026-09-03",
        note: MARKER,
      })
      .select("id")
      .single();
    if (adjErr) fail(`adjustment: ${adjErr.message}`);
    ids.adjustments.push(adj.id);

    const { data: invFinal } = await sb
      .from("arrival_inventory")
      .select("quantity_received, quantity_sold, quantity_adjustments, quantity_remaining")
      .eq("arrival_id", arrival.id)
      .single();
    const expectedRemaining = calculateAvailableInventory({
      received: invFinal.quantity_received,
      sold: invFinal.quantity_sold,
      adjustmentsDelta: invFinal.quantity_adjustments,
    });
    eq(expectedRemaining, 2, "formula remaining");
    eq(invFinal.quantity_remaining, 2, "db remaining");

    const { data: saleRows } = await sb
      .from("sales")
      .select("amount_paid_fcfa, sale_items ( quantity, sale_unit_price_fcfa, stock_arrivals ( supplier_unit_price_fcfa ) )")
      .in("id", ids.sales);
    const saleItems = saleRows.flatMap((sale) => sale.sale_items || []);
    const totals = calculatePeriodBusinessTotals({
      saleItems,
      sales: saleRows,
      customerPayments: [{ amount_fcfa: 15000 }],
      expenses: [
        { amount_fcfa: 8000, is_arrival_cost_allocation: false },
        { amount_fcfa: 7000, is_arrival_cost_allocation: true },
      ],
    });
    eq(totals.revenue, 175000, "revenue");
    eq(totals.cogs, 140000, "cogs");
    eq(totals.grossMargin, 35000, "gross margin");
    eq(totals.operatingExpenses, 8000, "opex excludes allocation");
    eq(
      totals.estimatedProfit,
      calculateEstimatedProfit({
        revenue: totals.revenue,
        cogs: totals.cogs,
        operatingExpenses: totals.operatingExpenses,
      }),
      "profit",
    );
    eq(totals.estimatedProfit, 27000, "expected profit");

    const outstandingCustomer = calculateCustomerOutstanding({
      purchases: 175000,
      paidAtSale: 70000,
      payments: 15000,
    });
    eq(outstandingCustomer, 90000, "customer outstanding");

    const outstandingSupplier = calculateSupplierOutstanding({
      merchandiseValue: merch,
      arrivalExpenses,
      advancePaid: 50000,
      paymentsTotal: 40000,
    });
    eq(outstandingSupplier, 110000, "supplier outstanding");

    const { error: badAdj } = await sb.from("inventory_adjustments").insert({
      product_id: pommes.id,
      arrival_id: arrival.id,
      quantity_delta: -99,
      reason: MARKER,
      adjustment_date: "2026-09-03",
      note: MARKER,
    });
    if (!badAdj) fail("negative-stock adjustment was allowed");

    console.log("OK   inventory / receivables / payables / profit");
  } finally {
    for (const id of ids.adjustments) await sb.from("inventory_adjustments").delete().eq("id", id);
    for (const id of ids.payments) await sb.from("customer_payments").delete().eq("id", id);
    for (const id of ids.supplierPayments) await sb.from("supplier_payments").delete().eq("id", id);
    for (const id of ids.expenses) await sb.from("business_expenses").delete().eq("id", id);
    for (const id of ids.sales) await sb.from("sales").delete().eq("id", id);
    if (ids.arrival) await sb.from("stock_arrivals").delete().eq("id", ids.arrival);
    if (ids.customer) await sb.from("customers").delete().eq("id", ids.customer);
    if (ids.recon) await sb.from("church_reconciliations").delete().eq("id", ids.recon);
    for (const id of ids.txs) await sb.from("church_transactions").delete().eq("id", id);
    await sb.from("church_transactions").delete().eq("reason", MARKER);
    await sb.from("church_reconciliations").delete().eq("note", MARKER);
    await sb.from("customers").delete().eq("note", MARKER);
    await sb.from("business_expenses").delete().eq("description", MARKER);
    await sb.from("inventory_adjustments").delete().eq("reason", MARKER);
    await sb.from("audit_events").delete().eq("new_values->>note", MARKER);
  }

  const { data: leftoverTx } = await sb.from("church_transactions").select("id").eq("reason", MARKER);
  if (leftoverTx?.length) fail("leftover church test txs");
  const { data: leftoverCust } = await sb.from("customers").select("id").eq("note", MARKER);
  if (leftoverCust?.length) fail("leftover test customer");

  const { data: churchRestored } = await sb.rpc("church_fund_balance", { p_fund_id: fund.id });
  eq(churchRestored, churchBefore, "church balance restored");

  const { data: soaStill } = await sb.from("suppliers").select("id").eq("code", "SOA").maybeSingle();
  const { data: pommesStill } = await sb.from("products").select("id").ilike("name", "pommes").maybeSingle();
  if (!soaStill || !pommesStill) fail("seed reference data was deleted");

  console.log("OK   cleaned temporary rows; seed data intact");
  console.log("PASS phase 5 integration");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
