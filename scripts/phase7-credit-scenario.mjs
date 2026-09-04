/**
 * Controlled credit/payment scenario against live Supabase.
 * Creates TEST PAYMENT CLIENT + temporary stock, then deletes all of it.
 */
import { createClient } from "@supabase/supabase-js";
import {
  allocatePaymentFifo,
  calculateCustomerOutstanding,
  computeSaleRemainders,
} from "../src/utils/business-calc.js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("FAIL: missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const NOTE = "PHASE71_TEST_PAYMENT_CLIENT";
const created = {
  customerId: null,
  arrivalId: null,
  saleId: null,
  paymentIds: [],
};

function saleTotal(sale) {
  return (sale.sale_items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.sale_unit_price_fcfa || 0),
    0,
  );
}

function outstandingFor(sales, payments, customerId) {
  const customerSales = sales.filter((s) => s.customer_id === customerId);
  const later = payments.filter((p) => p.customer_id === customerId);
  const purchases = customerSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
  const paidAtSale = customerSales.reduce((sum, sale) => sum + (sale.amount_paid_fcfa || 0), 0);
  const laterSum = later.reduce((sum, p) => sum + p.amount_fcfa, 0);
  const customerLevel = calculateCustomerOutstanding({
    purchases,
    paidAtSale,
    payments: laterSum,
  });
  const remainders = computeSaleRemainders(customerSales, later);
  const fifoTotal = remainders.reduce((sum, row) => sum + row.remaining, 0);
  return { customerLevel, fifoTotal, remainders };
}

async function loadLedger(customerId) {
  const [{ data: sales, error: sErr }, { data: payments, error: pErr }] = await Promise.all([
    sb
      .from("sales")
      .select("id, customer_id, sale_date, settlement_status, payment_method, amount_paid_fcfa, created_at, sale_items ( quantity, sale_unit_price_fcfa )")
      .eq("customer_id", customerId),
    sb
      .from("customer_payments")
      .select("id, customer_id, sale_id, amount_fcfa, payment_method, payment_date")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);
  if (sErr) throw sErr;
  if (pErr) throw pErr;
  return outstandingFor(sales || [], payments || [], customerId);
}

async function pay(customerId, saleId, remainders, amount, method) {
  const { allocations } = allocatePaymentFifo(remainders, amount);
  const { data, error } = await sb
    .from("customer_payments")
    .insert({
      customer_id: customerId,
      sale_id: allocations[0]?.saleId || saleId,
      amount_fcfa: amount,
      payment_method: method,
      payment_date: "2026-09-03",
      note: `${NOTE} ${method}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  created.paymentIds.push(data.id);
}

async function cleanup() {
  if (created.paymentIds.length) {
    await sb.from("customer_payments").delete().in("id", created.paymentIds);
  }
  if (created.saleId) {
    await sb.from("sale_items").delete().eq("sale_id", created.saleId);
    await sb.from("sales").delete().eq("id", created.saleId);
  }
  if (created.arrivalId) {
    await sb.from("stock_arrivals").delete().eq("id", created.arrivalId);
  }
  if (created.customerId) {
    await sb.from("customers").delete().eq("id", created.customerId);
  }
}

try {
  const { data: product, error: pErr } = await sb
    .from("products")
    .select("id, name")
    .eq("name", "Pommes")
    .maybeSingle();
  if (pErr || !product) throw pErr || new Error("Produit Pommes introuvable");

  const { data: supplier, error: supErr } = await sb
    .from("suppliers")
    .select("id, code")
    .eq("is_active", true)
    .order("code")
    .limit(1)
    .maybeSingle();
  if (supErr || !supplier) throw supErr || new Error("Aucun fournisseur");

  const { data: arrival, error: aErr } = await sb
    .from("stock_arrivals")
    .insert({
      supplier_id: supplier.id,
      product_id: product.id,
      arrival_date: "2026-09-03",
      quantity_received: 2,
      supplier_unit_price_fcfa: 40000,
      transport_fcfa: 0,
      unloading_fcfa: 0,
      other_expenses_fcfa: 0,
      advance_paid_fcfa: 0,
      expenses_owed_to_supplier: false,
      note: NOTE,
    })
    .select("id")
    .single();
  if (aErr) throw aErr;
  created.arrivalId = arrival.id;

  const { data: customer, error: cErr } = await sb
    .from("customers")
    .insert({ name: "TEST PAYMENT CLIENT", note: NOTE })
    .select("id, name")
    .single();
  if (cErr) throw cErr;
  created.customerId = customer.id;

  const { data: saleId, error: saleErr } = await sb.rpc("create_sale_with_item", {
    p_customer_id: customer.id,
    p_sale_date: "2026-09-03",
    p_payment_method: null,
    p_amount_paid_fcfa: 0,
    p_repayment_expectation: "exact",
    p_repayment_exact_date: "2026-09-15",
    p_repayment_approx_text: null,
    p_note: NOTE,
    p_product_id: product.id,
    p_arrival_id: arrival.id,
    p_quantity: 1,
    p_sale_unit_price_fcfa: 100000,
    p_effective_unit_cost_fcfa: 40000,
    p_settlement_status: "credit",
  });
  if (saleErr) throw saleErr;
  created.saleId = saleId;

  let ledger = await loadLedger(customer.id);
  if (ledger.customerLevel !== 100000 || ledger.fifoTotal !== 100000) {
    throw new Error(`After credit sale expected 100000, got ${ledger.customerLevel}/${ledger.fifoTotal}`);
  }

  await pay(customer.id, saleId, ledger.remainders, 30000, "mobile_money");
  ledger = await loadLedger(customer.id);
  if (ledger.customerLevel !== 70000) throw new Error(`After 30 000 expected 70000, got ${ledger.customerLevel}`);

  await pay(customer.id, saleId, ledger.remainders, 20000, "cash");
  ledger = await loadLedger(customer.id);
  if (ledger.customerLevel !== 50000) throw new Error(`After 20 000 expected 50000, got ${ledger.customerLevel}`);

  await pay(customer.id, saleId, ledger.remainders, 50000, "bank");
  ledger = await loadLedger(customer.id);
  if (ledger.customerLevel !== 0 || ledger.fifoTotal !== 0) {
    throw new Error(`After final payment expected 0, got ${ledger.customerLevel}/${ledger.fifoTotal}`);
  }

  const { data: saleRow } = await sb
    .from("sales")
    .select("settlement_status, payment_method, amount_paid_fcfa")
    .eq("id", saleId)
    .single();
  if (saleRow.settlement_status !== "credit" || saleRow.payment_method !== null || saleRow.amount_paid_fcfa !== 0) {
    throw new Error("Credit sale must keep settlement=credit and no method");
  }

  console.log("OK: TEST PAYMENT CLIENT credit 100000 → 30000 MM → 70000 → 20000 cash → 50000 → 50000 bank → 0");
} catch (err) {
  console.error("FAIL:", err.message || err);
  process.exitCode = 1;
} finally {
  await cleanup();
  const leftover = await sb.from("customers").select("id").eq("name", "TEST PAYMENT CLIENT");
  if ((leftover.data || []).length) {
    console.error("FAIL: TEST PAYMENT CLIENT still present after cleanup");
    process.exitCode = 1;
  } else {
    console.log("OK: test rows cleaned");
  }
}
