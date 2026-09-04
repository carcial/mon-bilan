-- Align DB margin / monthly result with the app canonical formula:
-- margin = sale revenue − (quantity × supplier expected amount per bag).
-- Do not use effective_unit_cost_fcfa (merchandise + fees) for user-facing margin.
-- effective_unit_cost_fcfa remains stored for internal batch cost only.

DROP VIEW IF EXISTS public.sale_item_totals;

CREATE VIEW public.sale_item_totals AS
SELECT
  si.id AS sale_item_id,
  si.sale_id,
  si.product_id,
  si.arrival_id,
  si.quantity,
  si.sale_unit_price_fcfa,
  (si.quantity * si.sale_unit_price_fcfa) AS line_total_fcfa,
  a.supplier_unit_price_fcfa,
  si.effective_unit_cost_fcfa,
  CASE
    WHEN a.supplier_unit_price_fcfa IS NULL THEN NULL
    ELSE (si.sale_unit_price_fcfa - a.supplier_unit_price_fcfa)
  END AS unit_margin_fcfa,
  CASE
    WHEN a.supplier_unit_price_fcfa IS NULL THEN NULL
    ELSE si.quantity * (si.sale_unit_price_fcfa - a.supplier_unit_price_fcfa)
  END AS line_margin_fcfa
FROM public.sale_items si
LEFT JOIN public.stock_arrivals a ON a.id = si.arrival_id;

GRANT SELECT ON public.sale_item_totals TO anon, authenticated;

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
  supplier_cogs AS (
    SELECT COALESCE(SUM(si.quantity * COALESCE(a.supplier_unit_price_fcfa, 0)), 0)::integer AS total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.stock_arrivals a ON a.id = si.arrival_id
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
       - (SELECT total FROM supplier_cogs)
       - (SELECT total FROM opex);
$$;

COMMENT ON FUNCTION public.business_monthly_estimated_result IS
  'Estimated monthly result = sales − supplier merchandise for sold qty − operating expenses (arrival fee allocations excluded). Not cash flow.';
