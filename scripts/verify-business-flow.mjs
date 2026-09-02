/**
 * Temporary Business Phase 3 check against the linked Supabase project.
 * Uses seed SOA + Pommes. Creates then deletes clearly labeled test rows.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const NOTE = "[TEST-PHASE3] temporaire — à supprimer";

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!url || !key || url.includes("YOUR_PROJECT")) {
    fail("configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: suppliers, error: sErr } = await sb.from("suppliers").select("id, code").eq("code", "SOA").maybeSingle();
  if (sErr || !suppliers) fail(`SOA missing: ${sErr?.message || "not found"}`);
  const { data: product, error: pErr } = await sb.from("products").select("id, name").ilike("name", "pommes").maybeSingle();
  if (pErr || !product) fail(`Pommes missing: ${pErr?.message || "not found"}`);

  const ids = {
    customer: null,
    arrival: null,
    sales: [],
    payments: [],
    supplierPayments: [],
    expenses: [],
  };

  try {
    const { data: customer, error: cErr } = await sb
      .from("customers")
      .insert({ name: "TEST-PHASE3 Client", note: NOTE })
      .select("id")
      .single();
    if (cErr) fail(`customer: ${cErr.message}`);
    ids.customer = customer.id;
    console.log("OK   customer", customer.id);

    const { data: arrival, error: aErr } = await sb
      .from("stock_arrivals")
      .insert({
        supplier_id: suppliers.id,
        product_id: product.id,
        arrival_date: "2026-09-02",
        quantity_received: 30,
        supplier_unit_price_fcfa: 25000,
        transport_fcfa: 30000,
        unloading_fcfa: 10000,
        other_expenses_fcfa: 5000,
        advance_paid_fcfa: 200000,
        note: NOTE,
      })
      .select("id")
      .single();
    if (aErr) fail(`arrival: ${aErr.message}`);
    ids.arrival = arrival.id;
    console.log("OK   arrival", arrival.id);

    const { data: inv1, error: i1 } = await sb
      .from("arrival_inventory")
      .select("quantity_remaining")
      .eq("arrival_id", arrival.id)
      .single();
    if (i1 || inv1.quantity_remaining !== 30) fail(`stock after arrival: ${i1?.message || inv1.quantity_remaining}`);
    console.log("OK   stock after arrival", inv1.quantity_remaining);

    const { data: cost } = await sb
      .from("stock_arrival_costs")
      .select("effective_unit_cost_fcfa, merchandise_value_fcfa")
      .eq("arrival_id", arrival.id)
      .single();
    if (cost.merchandise_value_fcfa !== 750000) fail("merchandise value");
    if (cost.effective_unit_cost_fcfa !== 26500) fail(`unit cost ${cost.effective_unit_cost_fcfa}`);
    console.log("OK   unit cost", cost.effective_unit_cost_fcfa);

    async function addSale(qty, price, paid, method) {
      const { data: sale, error: se } = await sb
        .from("sales")
        .insert({
          customer_id: customer.id,
          sale_date: "2026-09-02",
          payment_method: method,
          amount_paid_fcfa: paid,
          note: NOTE,
        })
        .select("id")
        .single();
      if (se) fail(`sale: ${se.message}`);
      const { error: ie } = await sb.from("sale_items").insert({
        sale_id: sale.id,
        product_id: product.id,
        arrival_id: arrival.id,
        quantity: qty,
        sale_unit_price_fcfa: price,
        effective_unit_cost_fcfa: 26500,
      });
      if (ie) {
        await sb.from("sales").delete().eq("id", sale.id);
        fail(`sale item: ${ie.message}`);
      }
      ids.sales.push(sale.id);
      return sale.id;
    }

    await addSale(2, 31000, 62000, "cash");
    await addSale(3, 31000, 0, "credit");
    await addSale(5, 31000, 50000, "partial");
    console.log("OK   cash / credit / partial sales");

    const { data: inv2 } = await sb
      .from("arrival_inventory")
      .select("quantity_remaining, quantity_sold")
      .eq("arrival_id", arrival.id)
      .single();
    if (inv2.quantity_sold !== 10 || inv2.quantity_remaining !== 20) {
      fail(`stock after sales sold=${inv2.quantity_sold} rem=${inv2.quantity_remaining}`);
    }
    console.log("OK   stock after sales", inv2.quantity_remaining);

    const { error: over } = await sb.from("sale_items").insert({
      sale_id: ids.sales[0],
      product_id: product.id,
      arrival_id: arrival.id,
      quantity: 999,
      sale_unit_price_fcfa: 1,
    });
    if (!over) fail("oversell was allowed");
    console.log("OK   oversell blocked");

    const { data: pay, error: pe } = await sb
      .from("customer_payments")
      .insert({
        customer_id: customer.id,
        sale_id: ids.sales[2],
        amount_fcfa: 40000,
        payment_date: "2026-09-02",
        note: NOTE,
      })
      .select("id")
      .single();
    if (pe) fail(`customer payment: ${pe.message}`);
    ids.payments.push(pay.id);

    const { data: sp, error: spe } = await sb
      .from("supplier_payments")
      .insert({
        supplier_id: suppliers.id,
        arrival_id: arrival.id,
        amount_fcfa: 100000,
        payment_date: "2026-09-02",
        note: NOTE,
      })
      .select("id")
      .single();
    if (spe) fail(`supplier payment: ${spe.message}`);
    ids.supplierPayments.push(sp.id);

    const { data: exp, error: ee } = await sb
      .from("business_expenses")
      .insert({
        category: "market_fees",
        amount_fcfa: 42000,
        expense_date: "2026-09-02",
        is_arrival_cost_allocation: false,
        description: NOTE,
      })
      .select("id")
      .single();
    if (ee) fail(`expense: ${ee.message}`);
    ids.expenses.push(exp.id);
    console.log("OK   payments + expense");
  } finally {
    for (const id of ids.payments) await sb.from("customer_payments").delete().eq("id", id);
    for (const id of ids.supplierPayments) await sb.from("supplier_payments").delete().eq("id", id);
    for (const id of ids.expenses) await sb.from("business_expenses").delete().eq("id", id);
    for (const id of ids.sales) await sb.from("sales").delete().eq("id", id);
    if (ids.arrival) await sb.from("stock_arrivals").delete().eq("id", ids.arrival);
    if (ids.customer) await sb.from("customers").delete().eq("id", ids.customer);
    await sb.from("customers").delete().eq("note", NOTE);
    await sb.from("business_expenses").delete().eq("description", NOTE);
  }

  const { data: leftoverCustomers } = await sb.from("customers").select("id").eq("note", NOTE);
  if (leftoverCustomers?.length) fail("leftover test customer");
  console.log("OK   cleaned test records");
  console.log("PASS business phase 3 verification");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
