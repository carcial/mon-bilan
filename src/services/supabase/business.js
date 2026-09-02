/**
 * Business data access — catalog, stock, sales, payments, expenses.
 * Uses the canonical Supabase client. Balances are derived, never stored twice.
 */

import { getSupabase, getSupabaseOrThrow } from "./client.js";
import { recordAuditEvent, recordAuditEventSafe } from "./audit.js";
import {
  calculateArrivalExpenses,
  calculateCustomerOutstanding,
  calculateEffectiveBatchCost,
  calculateEffectiveUnitCost,
  calculateMerchandiseValue,
  calculateOperatingExpenses,
  calculatePeriodBusinessTotals,
  calculateSupplierOutstanding,
  inferPaymentMethod,
} from "../../utils/business-calc.js";

const ARRIVAL_SELECT = `
  id, supplier_id, product_id, arrival_date, quantity_received,
  supplier_unit_price_fcfa, transport_fcfa, unloading_fcfa, other_expenses_fcfa,
  advance_paid_fcfa, expenses_owed_to_supplier, note, created_at, updated_at,
  suppliers ( id, code, name ),
  products ( id, name, unit_type )
`;

const SALE_SELECT = `
  id, customer_id, sale_date, payment_method, amount_paid_fcfa,
  repayment_expectation, repayment_exact_date, repayment_approx_text,
  note, created_at, updated_at,
  customers ( id, name, phone ),
  sale_items (
    id, product_id, arrival_id, quantity, sale_unit_price_fcfa, effective_unit_cost_fcfa,
    products ( id, name, unit_type ),
    stock_arrivals ( id, arrival_date, supplier_id, suppliers ( id, code, name ) )
  )
`;

export async function fetchActiveProducts() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("products")
    .select("id, name, unit_type, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchMonthlyBusinessResult() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("business_monthly_estimated_result");
  if (error) {
    console.warn("[business] result RPC unavailable:", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

export async function getSuppliers() {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("suppliers")
    .select("id, code, name, phone, note, is_active, created_at")
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return data ?? [];
}

export async function getSupplier(id) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("suppliers")
    .select("id, code, name, phone, note, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSupplier(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("suppliers")
    .insert({
      code: String(input.code || "").trim(),
      name: String(input.name || "").trim(),
      phone: input.phone ? String(input.phone).trim() : null,
      note: input.note ? String(input.note).trim() : null,
    })
    .select("id, code, name, phone, note, is_active")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "suppliers",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function getProducts() {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("products")
    .select("id, name, unit_type, description, is_active, created_at")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createProduct(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("products")
    .insert({
      name: String(input.name || "").trim(),
      unit_type: String(input.unitType || "sac").trim() || "sac",
      description: input.description ? String(input.description).trim() : null,
    })
    .select("id, name, unit_type, description, is_active")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "products",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function getCustomers() {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("customers")
    .select("id, name, phone, note, is_active, created_at")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getCustomer(id) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("customers")
    .select("id, name, phone, note, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCustomer(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("customers")
    .insert({
      name: String(input.name || "").trim(),
      phone: input.phone ? String(input.phone).trim() : null,
      note: input.note ? String(input.note).trim() : null,
    })
    .select("id, name, phone, note, is_active")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "customers",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function getProductInventory() {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("product_inventory")
    .select("product_id, product_name, unit_type, quantity_received, quantity_sold, quantity_adjustments, quantity_available")
    .order("product_name");
  if (error) throw error;
  return data ?? [];
}

export async function getArrivalInventory() {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("arrival_inventory")
    .select("arrival_id, product_id, supplier_id, quantity_received, quantity_sold, quantity_adjustments, quantity_remaining");
  if (error) throw error;
  return data ?? [];
}

export async function getArrivalCosts(arrivalId) {
  const sb = getSupabaseOrThrow();
  let query = sb.from("stock_arrival_costs").select("*");
  if (arrivalId) query = query.eq("arrival_id", arrivalId);
  const { data, error } = await query;
  if (error) throw error;
  return arrivalId ? data?.[0] ?? null : data ?? [];
}

export async function getArrivals(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("stock_arrivals")
    .select(ARRIVAL_SELECT)
    .order("arrival_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.from) query = query.gte("arrival_date", filters.from);
  if (filters.to) query = query.lte("arrival_date", filters.to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getArrival(id) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("stock_arrivals")
    .select(ARRIVAL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createArrival(input) {
  const sb = getSupabaseOrThrow();
  const payload = {
    supplier_id: input.supplierId,
    product_id: input.productId,
    arrival_date: input.date,
    quantity_received: input.quantity,
    supplier_unit_price_fcfa: input.unitPrice,
    transport_fcfa: input.transport || 0,
    unloading_fcfa: input.unloading || 0,
    other_expenses_fcfa: input.other || 0,
    advance_paid_fcfa: input.advance || 0,
    expenses_owed_to_supplier: Boolean(input.expensesOwedToSupplier),
    note: input.note ? String(input.note).trim() : null,
  };
  const { data, error } = await sb
    .from("stock_arrivals")
    .insert(payload)
    .select(ARRIVAL_SELECT)
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "stock_arrivals",
    entityId: data.id,
    action: "insert",
    newValues: snapshotArrival(data),
  });
  return data;
}

export async function getAvailableBatches(productId) {
  const [arrivals, inventory, costs] = await Promise.all([
    getArrivals({ productId }),
    getArrivalInventory(),
    getArrivalCosts(),
  ]);
  const invById = new Map(inventory.map((row) => [row.arrival_id, row]));
  const costById = new Map(costs.map((row) => [row.arrival_id, row]));
  return arrivals
    .map((arrival) => {
      const inv = invById.get(arrival.id);
      const cost = costById.get(arrival.id);
      const remaining = inv?.quantity_remaining ?? arrival.quantity_received;
      return {
        ...arrival,
        quantity_remaining: remaining,
        quantity_sold: inv?.quantity_sold ?? 0,
        effective_unit_cost_fcfa: cost?.effective_unit_cost_fcfa ?? null,
        merchandise_value_fcfa: cost?.merchandise_value_fcfa ?? 0,
      };
    })
    .filter((row) => row.quantity_remaining > 0);
}

export async function getSales(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("sales")
    .select(SALE_SELECT)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.from) query = query.gte("sale_date", filters.from);
  if (filters.to) query = query.lte("sale_date", filters.to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getSale(id) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("sales")
    .select(SALE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * One sale header + one line. If the line fails (stock), the header is removed.
 */
export async function createSale(input) {
  const sb = getSupabaseOrThrow();
  let customerId = input.customerId;
  if (!customerId && input.newCustomerName) {
    const customer = await createCustomer({
      name: input.newCustomerName,
      phone: input.newCustomerPhone,
    });
    customerId = customer.id;
  }

  const total = calculateMerchandiseValue(input.quantity, input.unitPrice);
  const amountPaid = input.amountPaid || 0;
  const method = input.paymentMethod || inferPaymentMethod(total, amountPaid);

  const { data: sale, error: saleError } = await sb
    .from("sales")
    .insert({
      customer_id: customerId,
      sale_date: input.date,
      payment_method: method,
      amount_paid_fcfa: amountPaid,
      repayment_expectation: input.repaymentExpectation || "undetermined",
      repayment_exact_date: input.repaymentExactDate || null,
      repayment_approx_text: input.repaymentApproxText || null,
      note: input.note ? String(input.note).trim() : null,
    })
    .select("id")
    .single();
  if (saleError) throw saleError;

  const { data: item, error: itemError } = await sb
    .from("sale_items")
    .insert({
      sale_id: sale.id,
      product_id: input.productId,
      arrival_id: input.arrivalId,
      quantity: input.quantity,
      sale_unit_price_fcfa: input.unitPrice,
      effective_unit_cost_fcfa: input.effectiveUnitCost,
    })
    .select("id")
    .single();

  if (itemError) {
    await sb.from("sales").delete().eq("id", sale.id);
    throw itemError;
  }

  const created = await getSale(sale.id);
  await recordAuditEventSafe({
    entityTable: "sales",
    entityId: sale.id,
    action: "insert",
    newValues: snapshotSale(created),
  });
  return created;
}

export async function deleteSale(id) {
  const existing = await getSale(id);
  if (!existing) throw new Error("Vente introuvable.");

  const sb = getSupabaseOrThrow();
  const { data: laterPayments, error: payErr } = await sb
    .from("customer_payments")
    .select("id")
    .eq("sale_id", id);
  if (payErr) throw payErr;
  if (laterPayments?.length) {
    throw new Error(
      "Cette vente a des paiements liés. Supprimez d'abord les paiements, ou laissez l'historique intact.",
    );
  }

  await recordAuditEvent({
    entityTable: "sales",
    entityId: existing.id,
    action: "delete",
    previousValues: snapshotSale(existing),
  });

  const { error } = await sb.from("sales").delete().eq("id", id);
  if (error) throw error;
  return existing;
}

export async function getCustomerPayments(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("customer_payments")
    .select("id, customer_id, sale_id, amount_fcfa, payment_date, note, created_at, customers ( id, name )")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.from) query = query.gte("payment_date", filters.from);
  if (filters.to) query = query.lte("payment_date", filters.to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createCustomerPayment(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("customer_payments")
    .insert({
      customer_id: input.customerId,
      sale_id: input.saleId || null,
      amount_fcfa: input.amount,
      payment_date: input.date,
      note: input.note ? String(input.note).trim() : null,
    })
    .select("id, customer_id, sale_id, amount_fcfa, payment_date, note")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "customer_payments",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function getSupplierPayments(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("supplier_payments")
    .select("id, supplier_id, arrival_id, amount_fcfa, payment_date, note, created_at, suppliers ( id, code, name )")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.from) query = query.gte("payment_date", filters.from);
  if (filters.to) query = query.lte("payment_date", filters.to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createSupplierPayment(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("supplier_payments")
    .insert({
      supplier_id: input.supplierId,
      arrival_id: input.arrivalId || null,
      amount_fcfa: input.amount,
      payment_date: input.date,
      note: input.note ? String(input.note).trim() : null,
    })
    .select("id, supplier_id, arrival_id, amount_fcfa, payment_date, note")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "supplier_payments",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function getExpenses(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("business_expenses")
    .select("id, category, amount_fcfa, expense_date, arrival_id, is_arrival_cost_allocation, description, note, created_at")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.from) query = query.gte("expense_date", filters.from);
  if (filters.to) query = query.lte("expense_date", filters.to);
  if (filters.opexOnly) query = query.eq("is_arrival_cost_allocation", false);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createExpense(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("business_expenses")
    .insert({
      category: input.category,
      amount_fcfa: input.amount,
      expense_date: input.date,
      arrival_id: input.arrivalId || null,
      is_arrival_cost_allocation: Boolean(input.isArrivalCostAllocation),
      description: String(input.description || "").trim(),
      note: input.note ? String(input.note).trim() : null,
    })
    .select("*")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "business_expenses",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function deleteExpense(id) {
  const sb = getSupabaseOrThrow();
  const { data: existing, error: readError } = await sb
    .from("business_expenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error("Dépense introuvable.");
  await recordAuditEvent({
    entityTable: "business_expenses",
    entityId: existing.id,
    action: "delete",
    previousValues: existing,
  });
  const { error } = await sb.from("business_expenses").delete().eq("id", id);
  if (error) throw error;
  return existing;
}

export async function getAdjustments(filters = {}) {
  const sb = getSupabaseOrThrow();
  let query = sb
    .from("inventory_adjustments")
    .select("id, product_id, arrival_id, quantity_delta, reason, adjustment_date, note, created_at, products ( id, name, unit_type )")
    .order("adjustment_date", { ascending: false });
  if (filters.productId) query = query.eq("product_id", filters.productId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAdjustment(input) {
  const sb = getSupabaseOrThrow();
  const { data, error } = await sb
    .from("inventory_adjustments")
    .insert({
      product_id: input.productId,
      arrival_id: input.arrivalId || null,
      quantity_delta: input.delta,
      reason: String(input.reason || "").trim(),
      adjustment_date: input.date,
      note: input.note ? String(input.note).trim() : null,
    })
    .select("*")
    .single();
  if (error) throw error;
  await recordAuditEventSafe({
    entityTable: "inventory_adjustments",
    entityId: data.id,
    action: "insert",
    newValues: data,
  });
  return data;
}

export async function getCustomerBalances() {
  const [customers, sales, payments] = await Promise.all([
    getCustomers(),
    getSales(),
    getCustomerPayments(),
  ]);

  return customers
    .map((customer) => {
      const customerSales = sales.filter((s) => s.customer_id === customer.id);
      const purchases = customerSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
      const paidAtSale = customerSales.reduce((sum, sale) => sum + (sale.amount_paid_fcfa || 0), 0);
      const later = payments
        .filter((p) => p.customer_id === customer.id)
        .reduce((sum, p) => sum + p.amount_fcfa, 0);
      const outstanding = calculateCustomerOutstanding({
        purchases,
        paidAtSale,
        payments: later,
      });
      const oldestUnpaid = customerSales
        .filter((sale) => saleTotal(sale) > (sale.amount_paid_fcfa || 0))
        .map((sale) => sale.repayment_exact_date || sale.sale_date)
        .sort()[0] || null;
      return {
        customer,
        purchases,
        paid: paidAtSale + later,
        outstanding,
        oldestUnpaid,
        sales: customerSales,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}

export async function getSupplierBalances() {
  const [suppliers, arrivals, payments, costs] = await Promise.all([
    getSuppliers(),
    getArrivals(),
    getSupplierPayments(),
    getArrivalCosts(),
  ]);
  const costById = new Map(costs.map((row) => [row.arrival_id, row]));

  return suppliers
    .map((supplier) => {
      const rows = arrivals.filter((a) => a.supplier_id === supplier.id);
      let merchandise = 0;
      let obligation = 0;
      let advances = 0;
      for (const arrival of rows) {
        const cost = costById.get(arrival.id);
        const merch = cost?.merchandise_value_fcfa
          ?? calculateMerchandiseValue(arrival.quantity_received, arrival.supplier_unit_price_fcfa);
        const expenses = cost?.arrival_expenses_fcfa
          ?? calculateArrivalExpenses({
            transport: arrival.transport_fcfa,
            unloading: arrival.unloading_fcfa,
            other: arrival.other_expenses_fcfa,
          });
        merchandise += merch;
        obligation += calculateSupplierOutstanding({
          merchandiseValue: merch,
          arrivalExpenses: expenses,
          expensesOwedToSupplier: arrival.expenses_owed_to_supplier,
          advancePaid: 0,
          paymentsTotal: 0,
        });
        advances += arrival.advance_paid_fcfa || 0;
      }
      const paidLater = payments
        .filter((p) => p.supplier_id === supplier.id)
        .reduce((sum, p) => sum + p.amount_fcfa, 0);
      const outstanding = Math.max(0, obligation - advances - paidLater);
      return {
        supplier,
        arrivals: rows,
        merchandise,
        paid: advances + paidLater,
        outstanding,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}

export async function getCustomerDetail(id) {
  const [customer, balances] = await Promise.all([
    getCustomer(id),
    getCustomerBalances(),
  ]);
  const row = balances.find((b) => b.customer.id === id);
  const payments = await getCustomerPayments({ customerId: id });
  return {
    customer,
    purchases: row?.purchases ?? 0,
    paid: row?.paid ?? 0,
    outstanding: row?.outstanding ?? 0,
    sales: row?.sales ?? [],
    payments,
  };
}

export async function getSupplierDetail(id) {
  const [supplier, balances] = await Promise.all([
    getSupplier(id),
    getSupplierBalances(),
  ]);
  const row = balances.find((b) => b.supplier.id === id);
  const payments = await getSupplierPayments({ supplierId: id });
  return {
    supplier,
    arrivals: row?.arrivals ?? [],
    merchandise: row?.merchandise ?? 0,
    paid: row?.paid ?? 0,
    outstanding: row?.outstanding ?? 0,
    payments,
  };
}

export async function getBordereau(id) {
  const [arrival, inventoryRows, cost, sales] = await Promise.all([
    getArrival(id),
    getArrivalInventory(),
    getArrivalCosts(id),
    getSales(),
  ]);
  if (!arrival) return null;
  const inv = inventoryRows.find((row) => row.arrival_id === id);
  const items = sales.flatMap((sale) =>
    (sale.sale_items || [])
      .filter((item) => item.arrival_id === id)
      .map((item) => ({ ...item, sale })),
  );
  const sold = inv?.quantity_sold ?? 0;
  const remaining = inv?.quantity_remaining ?? arrival.quantity_received;
  const revenue = items.reduce(
    (sum, item) => sum + item.quantity * item.sale_unit_price_fcfa,
    0,
  );
  const unitCost = cost?.effective_unit_cost_fcfa
    ?? calculateEffectiveUnitCost(
      calculateEffectiveBatchCost({
        quantity: arrival.quantity_received,
        unitPrice: arrival.supplier_unit_price_fcfa,
        transport: arrival.transport_fcfa,
        unloading: arrival.unloading_fcfa,
        other: arrival.other_expenses_fcfa,
      }),
      arrival.quantity_received,
    );
  const cogs = sold * (unitCost || 0);
  const payments = await getSupplierPayments();
  const arrivalPayments = payments
    .filter((p) => p.arrival_id === id)
    .reduce((sum, p) => sum + p.amount_fcfa, 0);
  const outstanding = calculateSupplierOutstanding({
    merchandiseValue: cost?.merchandise_value_fcfa
      ?? calculateMerchandiseValue(arrival.quantity_received, arrival.supplier_unit_price_fcfa),
    arrivalExpenses: cost?.arrival_expenses_fcfa ?? 0,
    expensesOwedToSupplier: arrival.expenses_owed_to_supplier,
    advancePaid: arrival.advance_paid_fcfa,
    paymentsTotal: arrivalPayments,
  });

  return {
    arrival,
    cost,
    sold,
    remaining,
    revenue,
    estimatedMargin: revenue - cogs,
    outstanding,
    items,
  };
}

export async function getBusinessReport(range = {}) {
  const [sales, payments, expenses, receivables, payables, inventory] = await Promise.all([
    getSales({ from: range.from, to: range.to }),
    getCustomerPayments({ from: range.from, to: range.to }),
    getExpenses({ from: range.from, to: range.to }),
    getCustomerBalances(),
    getSupplierBalances(),
    getProductInventory(),
  ]);

  const saleItems = sales.flatMap((sale) => sale.sale_items || []);
  const totals = calculatePeriodBusinessTotals({
    saleItems,
    sales,
    customerPayments: payments,
    expenses,
  });

  return {
    ...totals,
    receivablesTotal: receivables.reduce((sum, row) => sum + row.outstanding, 0),
    payablesTotal: payables.reduce((sum, row) => sum + row.outstanding, 0),
    stockUnits: inventory.reduce((sum, row) => sum + (row.quantity_available || 0), 0),
    inventory,
    receivables,
    payables,
    sales,
    expenses,
    operatingExpensesCheck: calculateOperatingExpenses(expenses),
  };
}

export async function getBusinessHistory(filters = {}) {
  const [arrivals, sales, customerPayments, supplierPayments, expenses, adjustments] = await Promise.all([
    getArrivals({ from: filters.from, to: filters.to }),
    getSales({ from: filters.from, to: filters.to }),
    getCustomerPayments({ from: filters.from, to: filters.to }),
    getSupplierPayments({ from: filters.from, to: filters.to }),
    getExpenses({ from: filters.from, to: filters.to }),
    getAdjustments(),
  ]);

  const rows = [
    ...arrivals.map((row) => ({
      kind: "arrival",
      id: row.id,
      date: row.arrival_date,
      created_at: row.created_at,
      row,
    })),
    ...sales.map((row) => ({
      kind: "sale",
      id: row.id,
      date: row.sale_date,
      created_at: row.created_at,
      row,
    })),
    ...customerPayments.map((row) => ({
      kind: "customer_payment",
      id: row.id,
      date: row.payment_date,
      created_at: row.created_at,
      row,
    })),
    ...supplierPayments.map((row) => ({
      kind: "supplier_payment",
      id: row.id,
      date: row.payment_date,
      created_at: row.created_at,
      row,
    })),
    ...expenses.map((row) => ({
      kind: "expense",
      id: row.id,
      date: row.expense_date,
      created_at: row.created_at,
      row,
    })),
    ...adjustments
      .filter((row) => !filters.from || row.adjustment_date >= filters.from)
      .filter((row) => !filters.to || row.adjustment_date <= filters.to)
      .map((row) => ({
        kind: "adjustment",
        id: row.id,
        date: row.adjustment_date,
        created_at: row.created_at,
        row,
      })),
  ];

  const filtered = filters.kind ? rows.filter((row) => row.kind === filters.kind) : rows;
  return filtered.sort((a, b) => {
    if (a.date === b.date) return String(b.created_at).localeCompare(String(a.created_at));
    return a.date < b.date ? 1 : -1;
  });
}

export function saleTotal(sale) {
  return (sale.sale_items || []).reduce(
    (sum, item) => sum + item.quantity * item.sale_unit_price_fcfa,
    0,
  );
}

function snapshotArrival(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    product_id: row.product_id,
    quantity_received: row.quantity_received,
    supplier_unit_price_fcfa: row.supplier_unit_price_fcfa,
    transport_fcfa: row.transport_fcfa,
    unloading_fcfa: row.unloading_fcfa,
    other_expenses_fcfa: row.other_expenses_fcfa,
    advance_paid_fcfa: row.advance_paid_fcfa,
  };
}

function snapshotSale(row) {
  return {
    id: row?.id,
    customer_id: row?.customer_id,
    sale_date: row?.sale_date,
    payment_method: row?.payment_method,
    amount_paid_fcfa: row?.amount_paid_fcfa,
    items: (row?.sale_items || []).map((item) => ({
      quantity: item.quantity,
      sale_unit_price_fcfa: item.sale_unit_price_fcfa,
      arrival_id: item.arrival_id,
    })),
  };
}
