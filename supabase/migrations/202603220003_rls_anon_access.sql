-- =============================================================================
-- RLS for single-user, no-auth personal tool
--
-- SECURITY TRADEOFF (intentional):
-- This application has NO authentication. The frontend uses only the
-- publishable/anon key. Policies below allow full CRUD for the `anon` and
-- `authenticated` roles so the app can read/write without auth.uid().
--
-- Anyone who obtains the project URL + anon key can access the data.
-- Acceptable ONLY because this is a private, single-user personal tool —
-- not a multi-tenant SaaS. Treat URL + anon key like a household shared PIN.
-- =============================================================================

ALTER TABLE public.church_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Open policies for anon + authenticated (no per-user filtering)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'church_funds',
    'church_transactions',
    'church_reconciliations',
    'suppliers',
    'products',
    'customers',
    'stock_arrivals',
    'inventory_adjustments',
    'sales',
    'sale_items',
    'customer_payments',
    'supplier_payments',
    'business_expenses',
    'audit_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'allow_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      'allow_all_' || t,
      t
    );
  END LOOP;
END $$;

-- Table privileges (RLS still applies; without GRANT, PostgREST cannot access rows)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.church_funds,
  public.church_transactions,
  public.church_reconciliations,
  public.suppliers,
  public.products,
  public.customers,
  public.stock_arrivals,
  public.inventory_adjustments,
  public.sales,
  public.sale_items,
  public.customer_payments,
  public.supplier_payments,
  public.business_expenses,
  public.audit_events
TO anon, authenticated;

-- RPC execute rights (signature: fund balance as-of date)
REVOKE ALL ON FUNCTION public.church_fund_balance(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.church_combined_balance(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_monthly_estimated_result(integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.church_fund_balance(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.church_combined_balance(date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_monthly_estimated_result(integer, integer) TO anon, authenticated;

-- Trigger helper created in 001 — not callable by clients
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

-- Inventory trigger helpers are revoked after creation (see 004).

GRANT SELECT ON public.stock_arrival_costs TO anon, authenticated;
GRANT SELECT ON public.sale_item_totals TO anon, authenticated;
GRANT SELECT ON public.product_inventory TO anon, authenticated;
GRANT SELECT ON public.arrival_inventory TO anon, authenticated;
