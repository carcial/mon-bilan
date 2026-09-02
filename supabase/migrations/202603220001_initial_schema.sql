-- =============================================================================
-- Mon Bilan — Phase 1 initial schema
-- Single-user personal tool: NO authentication, NO auth.uid() ownership.
-- Access is intentionally open to the anon/publishable key (see 003_rls).
-- All monetary amounts are INTEGER FCFA (no floating point).
-- =============================================================================

-- gen_random_uuid() is available on Supabase Postgres without enabling pgcrypto.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- CHURCH
-- ---------------------------------------------------------------------------

CREATE TABLE public.church_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  opening_balance_fcfa integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT church_funds_code_unique UNIQUE (code),
  CONSTRAINT church_funds_code_nonempty CHECK (length(trim(code)) > 0),
  CONSTRAINT church_funds_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER trg_church_funds_updated_at
BEFORE UPDATE ON public.church_funds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.church_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.church_funds (id) ON DELETE RESTRICT,
  transaction_type text NOT NULL,
  amount_fcfa integer NOT NULL,
  transaction_date date NOT NULL,
  reason text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT church_transactions_type_check
    CHECK (transaction_type IN ('income', 'expense')),
  CONSTRAINT church_transactions_amount_positive
    CHECK (amount_fcfa > 0),
  CONSTRAINT church_transactions_reason_nonempty
    CHECK (length(trim(reason)) > 0)
);

CREATE INDEX church_transactions_fund_date_idx
  ON public.church_transactions (fund_id, transaction_date DESC);

CREATE INDEX church_transactions_date_idx
  ON public.church_transactions (transaction_date DESC);

CREATE INDEX church_transactions_type_idx
  ON public.church_transactions (transaction_type);

CREATE TRIGGER trg_church_transactions_updated_at
BEFORE UPDATE ON public.church_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.church_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL fund_id = reconciliation across all church funds combined
  fund_id uuid REFERENCES public.church_funds (id) ON DELETE RESTRICT,
  theoretical_balance_fcfa integer NOT NULL,
  actual_cash_fcfa integer NOT NULL,
  difference_fcfa integer NOT NULL,
  note text,
  reconciled_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT church_reconciliations_actual_nonnegative
    CHECK (actual_cash_fcfa >= 0),
  CONSTRAINT church_reconciliations_difference_coherent
    CHECK (difference_fcfa = actual_cash_fcfa - theoretical_balance_fcfa)
);

CREATE INDEX church_reconciliations_fund_time_idx
  ON public.church_reconciliations (fund_id, reconciled_at DESC);

CREATE INDEX church_reconciliations_time_idx
  ON public.church_reconciliations (reconciled_at DESC);

-- ---------------------------------------------------------------------------
-- BUSINESS reference entities
-- ---------------------------------------------------------------------------

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  phone text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT suppliers_code_unique UNIQUE (code),
  CONSTRAINT suppliers_code_nonempty CHECK (length(trim(code)) > 0),
  CONSTRAINT suppliers_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_type text NOT NULL DEFAULT 'sac',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT products_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT products_unit_nonempty CHECK (length(trim(unit_type)) > 0)
);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT customers_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX customers_name_idx ON public.customers (name);

-- ---------------------------------------------------------------------------
-- Stock arrivals (bordereaux)
-- ---------------------------------------------------------------------------

CREATE TABLE public.stock_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  arrival_date date NOT NULL,
  quantity_received integer NOT NULL,
  supplier_unit_price_fcfa integer NOT NULL,
  transport_fcfa integer NOT NULL DEFAULT 0,
  unloading_fcfa integer NOT NULL DEFAULT 0,
  other_expenses_fcfa integer NOT NULL DEFAULT 0,
  -- Advance already paid to supplier for this arrival (reduces supplier debt)
  advance_paid_fcfa integer NOT NULL DEFAULT 0,
  -- If true, transport+unloading+other are also owed to the same supplier
  expenses_owed_to_supplier boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT stock_arrivals_qty_positive CHECK (quantity_received > 0),
  CONSTRAINT stock_arrivals_unit_price_nonnegative CHECK (supplier_unit_price_fcfa >= 0),
  CONSTRAINT stock_arrivals_transport_nonnegative CHECK (transport_fcfa >= 0),
  CONSTRAINT stock_arrivals_unloading_nonnegative CHECK (unloading_fcfa >= 0),
  CONSTRAINT stock_arrivals_other_nonnegative CHECK (other_expenses_fcfa >= 0),
  CONSTRAINT stock_arrivals_advance_nonnegative CHECK (advance_paid_fcfa >= 0)
);

CREATE INDEX stock_arrivals_supplier_date_idx
  ON public.stock_arrivals (supplier_id, arrival_date DESC);

CREATE INDEX stock_arrivals_product_date_idx
  ON public.stock_arrivals (product_id, arrival_date DESC);

CREATE TRIGGER trg_stock_arrivals_updated_at
BEFORE UPDATE ON public.stock_arrivals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Generated financial fields as views/helpers (not stored to avoid drift)
CREATE OR REPLACE VIEW public.stock_arrival_costs AS
SELECT
  a.id AS arrival_id,
  a.quantity_received,
  a.supplier_unit_price_fcfa,
  (a.quantity_received * a.supplier_unit_price_fcfa) AS merchandise_value_fcfa,
  (a.transport_fcfa + a.unloading_fcfa + a.other_expenses_fcfa) AS arrival_expenses_fcfa,
  (
    (a.quantity_received * a.supplier_unit_price_fcfa)
    + a.transport_fcfa + a.unloading_fcfa + a.other_expenses_fcfa
  ) AS effective_batch_cost_fcfa,
  CASE
    WHEN a.quantity_received > 0 THEN
      (
        (a.quantity_received * a.supplier_unit_price_fcfa)
        + a.transport_fcfa + a.unloading_fcfa + a.other_expenses_fcfa
        + (a.quantity_received / 2)
      ) / a.quantity_received
    ELSE NULL
  END AS effective_unit_cost_fcfa,
  a.advance_paid_fcfa,
  a.expenses_owed_to_supplier,
  CASE
    WHEN a.expenses_owed_to_supplier THEN
      (a.quantity_received * a.supplier_unit_price_fcfa)
      + a.transport_fcfa + a.unloading_fcfa + a.other_expenses_fcfa
    ELSE
      (a.quantity_received * a.supplier_unit_price_fcfa)
  END AS supplier_obligation_base_fcfa
FROM public.stock_arrivals a;

-- ---------------------------------------------------------------------------
-- Inventory adjustments (never silently mutate arrival quantities)
-- ---------------------------------------------------------------------------

CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  arrival_id uuid REFERENCES public.stock_arrivals (id) ON DELETE RESTRICT,
  -- Signed quantity: negative = damage/loss/missing, positive = correction add
  quantity_delta integer NOT NULL,
  reason text NOT NULL,
  adjustment_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT inventory_adjustments_delta_nonzero CHECK (quantity_delta <> 0),
  CONSTRAINT inventory_adjustments_reason_nonempty CHECK (length(trim(reason)) > 0)
);

CREATE INDEX inventory_adjustments_product_date_idx
  ON public.inventory_adjustments (product_id, adjustment_date DESC);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  sale_date date NOT NULL,
  payment_method text NOT NULL,
  -- Amount paid immediately at sale time (cash portion)
  amount_paid_fcfa integer NOT NULL DEFAULT 0,
  repayment_expectation text NOT NULL DEFAULT 'undetermined',
  repayment_exact_date date,
  repayment_approx_text text,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('cash', 'credit', 'partial')),
  CONSTRAINT sales_amount_paid_nonnegative
    CHECK (amount_paid_fcfa >= 0),
  CONSTRAINT sales_repayment_expectation_check
    CHECK (repayment_expectation IN ('exact', 'approximate', 'undetermined')),
  CONSTRAINT sales_repayment_exact_requires_date
    CHECK (
      (repayment_expectation <> 'exact')
      OR (repayment_exact_date IS NOT NULL)
    ),
  CONSTRAINT sales_repayment_approx_requires_text
    CHECK (
      (repayment_expectation <> 'approximate')
      OR (repayment_approx_text IS NOT NULL AND length(trim(repayment_approx_text)) > 0)
    )
);

CREATE INDEX sales_customer_date_idx ON public.sales (customer_id, sale_date DESC);
CREATE INDEX sales_date_idx ON public.sales (sale_date DESC);

CREATE TRIGGER trg_sales_updated_at
BEFORE UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  -- Prefer linking to a specific arrival batch for cost/margin tracking
  arrival_id uuid REFERENCES public.stock_arrivals (id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  sale_unit_price_fcfa integer NOT NULL,
  -- Snapshot of effective unit cost at sale time (nullable if unknown)
  effective_unit_cost_fcfa integer,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT sale_items_qty_positive CHECK (quantity > 0),
  CONSTRAINT sale_items_price_nonnegative CHECK (sale_unit_price_fcfa >= 0),
  CONSTRAINT sale_items_cost_nonnegative
    CHECK (effective_unit_cost_fcfa IS NULL OR effective_unit_cost_fcfa >= 0)
);

CREATE INDEX sale_items_sale_idx ON public.sale_items (sale_id);
CREATE INDEX sale_items_product_idx ON public.sale_items (product_id);
CREATE INDEX sale_items_arrival_idx ON public.sale_items (arrival_id);

CREATE OR REPLACE VIEW public.sale_item_totals AS
SELECT
  si.id AS sale_item_id,
  si.sale_id,
  si.product_id,
  si.arrival_id,
  si.quantity,
  si.sale_unit_price_fcfa,
  (si.quantity * si.sale_unit_price_fcfa) AS line_total_fcfa,
  si.effective_unit_cost_fcfa,
  CASE
    WHEN si.effective_unit_cost_fcfa IS NULL THEN NULL
    ELSE (si.sale_unit_price_fcfa - si.effective_unit_cost_fcfa)
  END AS unit_margin_fcfa,
  CASE
    WHEN si.effective_unit_cost_fcfa IS NULL THEN NULL
    ELSE si.quantity * (si.sale_unit_price_fcfa - si.effective_unit_cost_fcfa)
  END AS line_margin_fcfa
FROM public.sale_items si;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  sale_id uuid REFERENCES public.sales (id) ON DELETE RESTRICT,
  amount_fcfa integer NOT NULL,
  payment_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT customer_payments_amount_positive CHECK (amount_fcfa > 0)
);

CREATE INDEX customer_payments_customer_date_idx
  ON public.customer_payments (customer_id, payment_date DESC);

CREATE INDEX customer_payments_sale_idx
  ON public.customer_payments (sale_id);

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id) ON DELETE RESTRICT,
  arrival_id uuid REFERENCES public.stock_arrivals (id) ON DELETE RESTRICT,
  amount_fcfa integer NOT NULL,
  payment_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT supplier_payments_amount_positive CHECK (amount_fcfa > 0)
);

CREATE INDEX supplier_payments_supplier_date_idx
  ON public.supplier_payments (supplier_id, payment_date DESC);

CREATE INDEX supplier_payments_arrival_idx
  ON public.supplier_payments (arrival_id);

-- ---------------------------------------------------------------------------
-- Business expenses (operating; may optionally link to an arrival)
-- Expenses linked here that are ALSO stored on stock_arrivals.transport/etc.
-- must not be double-counted in reporting (app layer + report helpers).
-- ---------------------------------------------------------------------------

CREATE TABLE public.business_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount_fcfa integer NOT NULL,
  expense_date date NOT NULL,
  arrival_id uuid REFERENCES public.stock_arrivals (id) ON DELETE SET NULL,
  -- When true, this row is the ledger copy of arrival transport/unload/other
  -- and must be excluded from "extra operating expenses" totals.
  is_arrival_cost_allocation boolean NOT NULL DEFAULT false,
  description text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT business_expenses_category_check
    CHECK (category IN (
      'transport',
      'unloading',
      'workers',
      'market_fees',
      'rent',
      'taxes',
      'phone',
      'other'
    )),
  CONSTRAINT business_expenses_amount_positive CHECK (amount_fcfa > 0),
  CONSTRAINT business_expenses_description_nonempty
    CHECK (length(trim(description)) > 0)
);

CREATE INDEX business_expenses_date_idx
  ON public.business_expenses (expense_date DESC);

CREATE INDEX business_expenses_category_idx
  ON public.business_expenses (category);

CREATE INDEX business_expenses_arrival_idx
  ON public.business_expenses (arrival_id);

CREATE TRIGGER trg_business_expenses_updated_at
BEFORE UPDATE ON public.business_expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit trail (lightweight)
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT audit_events_action_check
    CHECK (action IN ('insert', 'update', 'delete')),
  CONSTRAINT audit_events_table_nonempty CHECK (length(trim(entity_table)) > 0)
);

CREATE INDEX audit_events_entity_idx
  ON public.audit_events (entity_table, entity_id, created_at DESC);

CREATE INDEX audit_events_created_idx
  ON public.audit_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- Inventory availability helper view (product level)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.product_inventory AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.unit_type,
  COALESCE(recv.qty, 0) AS quantity_received,
  COALESCE(sold.qty, 0) AS quantity_sold,
  COALESCE(adj.qty, 0) AS quantity_adjustments,
  COALESCE(recv.qty, 0) - COALESCE(sold.qty, 0) + COALESCE(adj.qty, 0) AS quantity_available
FROM public.products p
LEFT JOIN (
  SELECT product_id, SUM(quantity_received)::integer AS qty
  FROM public.stock_arrivals
  GROUP BY product_id
) recv ON recv.product_id = p.id
LEFT JOIN (
  SELECT product_id, SUM(quantity)::integer AS qty
  FROM public.sale_items
  GROUP BY product_id
) sold ON sold.product_id = p.id
LEFT JOIN (
  SELECT product_id, SUM(quantity_delta)::integer AS qty
  FROM public.inventory_adjustments
  GROUP BY product_id
) adj ON adj.product_id = p.id;

-- Per-arrival remaining (for bordereau detail)
CREATE OR REPLACE VIEW public.arrival_inventory AS
SELECT
  a.id AS arrival_id,
  a.product_id,
  a.supplier_id,
  a.quantity_received,
  COALESCE(sold.qty, 0) AS quantity_sold,
  COALESCE(adj.qty, 0) AS quantity_adjustments,
  a.quantity_received - COALESCE(sold.qty, 0) + COALESCE(adj.qty, 0) AS quantity_remaining
FROM public.stock_arrivals a
LEFT JOIN (
  SELECT arrival_id, SUM(quantity)::integer AS qty
  FROM public.sale_items
  WHERE arrival_id IS NOT NULL
  GROUP BY arrival_id
) sold ON sold.arrival_id = a.id
LEFT JOIN (
  SELECT arrival_id, SUM(quantity_delta)::integer AS qty
  FROM public.inventory_adjustments
  WHERE arrival_id IS NOT NULL
  GROUP BY arrival_id
) adj ON adj.arrival_id = a.id;

-- ---------------------------------------------------------------------------
-- Balance / reporting RPCs (integer FCFA)
-- Church and Business remain strictly separate.
-- ---------------------------------------------------------------------------

-- Current / as-of balance for one fund:
-- opening + income - expenses for all transactions with date <= p_as_of
-- (p_as_of NULL = include all dates). Period income/expense reports should
-- query church_transactions directly — do not misuse this as a period P&L.
CREATE OR REPLACE FUNCTION public.church_fund_balance(
  p_fund_id uuid,
  p_as_of date DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (
        SELECT f.opening_balance_fcfa
        FROM public.church_funds f
        WHERE f.id = p_fund_id
      ),
      0
    )
    + COALESCE((
        SELECT SUM(t.amount_fcfa)::integer
        FROM public.church_transactions t
        WHERE t.fund_id = p_fund_id
          AND t.transaction_type = 'income'
          AND (p_as_of IS NULL OR t.transaction_date <= p_as_of)
      ), 0)
    - COALESCE((
        SELECT SUM(t.amount_fcfa)::integer
        FROM public.church_transactions t
        WHERE t.fund_id = p_fund_id
          AND t.transaction_type = 'expense'
          AND (p_as_of IS NULL OR t.transaction_date <= p_as_of)
      ), 0);
$$;

CREATE OR REPLACE FUNCTION public.church_combined_balance(
  p_as_of date DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(public.church_fund_balance(f.id, p_as_of)), 0)::integer
  FROM public.church_funds f
  WHERE f.is_active = true;
$$;

-- Soft stub for home card — refined in later reporting phase
CREATE OR REPLACE FUNCTION public.business_monthly_estimated_result(
  p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer,
  p_month integer DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::integer
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      make_date(p_year, p_month, 1) AS d_from,
      (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS d_to
  ),
  revenue AS (
    SELECT COALESCE(SUM(si.quantity * si.sale_unit_price_fcfa), 0)::integer AS total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN bounds b
    WHERE s.sale_date BETWEEN b.d_from AND b.d_to
  ),
  cogs AS (
    SELECT COALESCE(SUM(si.quantity * COALESCE(si.effective_unit_cost_fcfa, 0)), 0)::integer AS total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN bounds b
    WHERE s.sale_date BETWEEN b.d_from AND b.d_to
  ),
  opex AS (
    SELECT COALESCE(SUM(e.amount_fcfa), 0)::integer AS total
    FROM public.business_expenses e
    CROSS JOIN bounds b
    WHERE e.expense_date BETWEEN b.d_from AND b.d_to
      AND e.is_arrival_cost_allocation = false
  )
  SELECT (SELECT total FROM revenue)
       - (SELECT total FROM cogs)
       - (SELECT total FROM opex);
$$;

COMMENT ON TABLE public.church_funds IS 'Church treasury funds (e.g. Ordinary, Works). Never mixed with business money.';
COMMENT ON TABLE public.church_transactions IS 'Church income/expense movements in integer FCFA.';
COMMENT ON TABLE public.church_reconciliations IS 'Cash count vs theoretical church balance.';
COMMENT ON TABLE public.stock_arrivals IS 'Supplier merchandise arrivals (bordereaux).';
COMMENT ON TABLE public.sales IS 'Customer sales headers; receivables derived from items + payments.';
COMMENT ON TABLE public.audit_events IS 'Lightweight audit trail for important mutations.';
COMMENT ON FUNCTION public.church_combined_balance IS 'Sum of active church fund balances only — excludes all business money.';
