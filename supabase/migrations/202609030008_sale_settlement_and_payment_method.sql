-- Phase 7: separate settlement status from payment instrument.
-- Existing sales.payment_method mixed cash/credit/partial.
-- After this: settlement_status = paid|partial|credit
--             payment_method    = cash|mobile_money|bank (null when credit)

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS settlement_status text;

UPDATE public.sales
SET settlement_status = CASE payment_method
  WHEN 'credit' THEN 'credit'
  WHEN 'partial' THEN 'partial'
  ELSE 'paid'
END
WHERE settlement_status IS NULL;

ALTER TABLE public.sales
  ALTER COLUMN settlement_status SET DEFAULT 'paid';

ALTER TABLE public.sales
  ALTER COLUMN settlement_status SET NOT NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_settlement_status_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_settlement_status_check
  CHECK (settlement_status IN ('paid', 'partial', 'credit'));

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE public.sales
  ALTER COLUMN payment_method DROP NOT NULL;

UPDATE public.sales
SET payment_method = CASE
  WHEN settlement_status = 'credit' THEN NULL
  ELSE 'cash'
END
WHERE payment_method IS NULL OR payment_method IN ('cash', 'credit', 'partial');

ALTER TABLE public.sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'mobile_money', 'bank'));

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_payment_method_matches_settlement;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_payment_method_matches_settlement
  CHECK (
    (settlement_status = 'credit' AND payment_method IS NULL AND amount_paid_fcfa = 0)
    OR (settlement_status = 'partial' AND payment_method IS NOT NULL AND amount_paid_fcfa > 0)
    OR (settlement_status = 'paid' AND payment_method IS NOT NULL)
  );

ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.customer_payments
SET payment_method = 'cash'
WHERE payment_method IS NULL;

ALTER TABLE public.customer_payments
  ALTER COLUMN payment_method SET DEFAULT 'cash';

ALTER TABLE public.customer_payments
  ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE public.customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_method_check;

ALTER TABLE public.customer_payments
  ADD CONSTRAINT customer_payments_method_check
  CHECK (payment_method IN ('cash', 'mobile_money', 'bank'));

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.supplier_payments
SET payment_method = 'cash'
WHERE payment_method IS NULL;

ALTER TABLE public.supplier_payments
  ALTER COLUMN payment_method SET DEFAULT 'cash';

ALTER TABLE public.supplier_payments
  ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_method_check;

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_method_check
  CHECK (payment_method IN ('cash', 'mobile_money', 'bank'));

DROP FUNCTION IF EXISTS public.create_sale_with_item(
  uuid, date, text, integer, text, date, text, text, uuid, uuid, integer, integer, integer
);

CREATE OR REPLACE FUNCTION public.create_sale_with_item(
  p_customer_id uuid,
  p_sale_date date,
  p_payment_method text,
  p_amount_paid_fcfa integer,
  p_repayment_expectation text,
  p_repayment_exact_date date,
  p_repayment_approx_text text,
  p_note text,
  p_product_id uuid,
  p_arrival_id uuid,
  p_quantity integer,
  p_sale_unit_price_fcfa integer,
  p_effective_unit_cost_fcfa integer,
  p_settlement_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_status text;
  v_method text;
  v_paid integer;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Client requis'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être supérieure à 0'
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid := COALESCE(p_amount_paid_fcfa, 0);
  v_status := COALESCE(NULLIF(trim(p_settlement_status), ''), 
    CASE
      WHEN v_paid <= 0 THEN 'credit'
      WHEN p_payment_method IN ('credit') THEN 'credit'
      WHEN p_payment_method IN ('partial') THEN 'partial'
      ELSE 'paid'
    END
  );
  IF v_status = 'credit' THEN
    v_method := NULL;
    v_paid := 0;
  ELSIF p_payment_method IN ('cash', 'mobile_money', 'bank') THEN
    v_method := p_payment_method;
  ELSE
    v_method := 'cash';
  END IF;

  INSERT INTO public.sales (
    customer_id,
    sale_date,
    settlement_status,
    payment_method,
    amount_paid_fcfa,
    repayment_expectation,
    repayment_exact_date,
    repayment_approx_text,
    note
  ) VALUES (
    p_customer_id,
    p_sale_date,
    v_status,
    v_method,
    v_paid,
    COALESCE(p_repayment_expectation, 'undetermined'),
    p_repayment_exact_date,
    p_repayment_approx_text,
    p_note
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_items (
    sale_id,
    product_id,
    arrival_id,
    quantity,
    sale_unit_price_fcfa,
    effective_unit_cost_fcfa
  ) VALUES (
    v_sale_id,
    p_product_id,
    p_arrival_id,
    p_quantity,
    p_sale_unit_price_fcfa,
    p_effective_unit_cost_fcfa
  );

  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_item(
  uuid, date, text, integer, text, date, text, text, uuid, uuid, integer, integer, integer, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_with_item(
  uuid, date, text, integer, text, date, text, text, uuid, uuid, integer, integer, integer, text
) TO anon, authenticated;
