-- Phase 5: integrity + atomic sale write.
-- Unique customer names, product-level oversell, adjustment floor,
-- and a single-transaction RPC for sale header + line.

-- ---------------------------------------------------------------------------
-- Customers: prevent accidental duplicate names (case/space insensitive)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS customers_name_unique_ci
  ON public.customers (lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Atomic sale: customer already resolved by the app; header + line together
-- ---------------------------------------------------------------------------

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
  p_effective_unit_cost_fcfa integer
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Client requis'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être supérieure à 0'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.sales (
    customer_id,
    sale_date,
    payment_method,
    amount_paid_fcfa,
    repayment_expectation,
    repayment_exact_date,
    repayment_approx_text,
    note
  ) VALUES (
    p_customer_id,
    p_sale_date,
    p_payment_method,
    COALESCE(p_amount_paid_fcfa, 0),
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
  uuid, date, text, integer, text, date, text, text, uuid, uuid, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_with_item(
  uuid, date, text, integer, text, date, text, text, uuid, uuid, integer, integer, integer
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Oversell: batch remaining AND product remaining (product-level adjustments)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_sale_item_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  batch_available integer;
  product_available integer;
BEGIN
  SELECT quantity_available INTO product_available
  FROM public.product_inventory
  WHERE product_id = NEW.product_id;

  IF product_available IS NULL OR product_available < NEW.quantity THEN
    RAISE EXCEPTION 'Quantité insuffisante en stock pour ce produit (dispo: %)', COALESCE(product_available, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.arrival_id IS NOT NULL THEN
    SELECT quantity_remaining INTO batch_available
    FROM public.arrival_inventory
    WHERE arrival_id = NEW.arrival_id;

    IF batch_available IS NULL OR batch_available < NEW.quantity THEN
      RAISE EXCEPTION 'Quantité insuffisante sur ce bordereau (dispo: %)', COALESCE(batch_available, 0)
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.stock_arrivals a
      WHERE a.id = NEW.arrival_id AND a.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'Le produit ne correspond pas au bordereau sélectionné'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sale_item_availability_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  batch_available integer;
  product_available integer;
  batch_room integer;
  product_room integer;
BEGIN
  IF NEW.quantity = OLD.quantity
     AND NEW.product_id = OLD.product_id
     AND NEW.arrival_id IS NOT DISTINCT FROM OLD.arrival_id THEN
    RETURN NEW;
  END IF;

  SELECT quantity_available INTO product_available
  FROM public.product_inventory
  WHERE product_id = NEW.product_id;
  product_room := COALESCE(product_available, 0) + CASE
    WHEN OLD.product_id = NEW.product_id THEN OLD.quantity
    ELSE 0
  END;
  IF product_room < NEW.quantity THEN
    RAISE EXCEPTION 'Quantité insuffisante après modification (dispo: %)', product_room
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.arrival_id IS NOT NULL THEN
    SELECT quantity_remaining INTO batch_available
    FROM public.arrival_inventory
    WHERE arrival_id = NEW.arrival_id;
    batch_room := COALESCE(batch_available, 0) + CASE
      WHEN OLD.arrival_id IS NOT DISTINCT FROM NEW.arrival_id THEN OLD.quantity
      ELSE 0
    END;
    IF batch_room < NEW.quantity THEN
      RAISE EXCEPTION 'Quantité insuffisante après modification (dispo: %)', batch_room
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Adjustments cannot drive inventory below zero
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_adjustment_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available integer;
BEGIN
  IF NEW.quantity_delta >= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.arrival_id IS NOT NULL THEN
    SELECT quantity_remaining INTO available
    FROM public.arrival_inventory
    WHERE arrival_id = NEW.arrival_id;
    IF COALESCE(available, 0) + NEW.quantity_delta < 0 THEN
      RAISE EXCEPTION 'Ajustement impossible : stock du bordereau insuffisant (dispo: %)', COALESCE(available, 0)
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT quantity_available INTO available
    FROM public.product_inventory
    WHERE product_id = NEW.product_id;
    IF COALESCE(available, 0) + NEW.quantity_delta < 0 THEN
      RAISE EXCEPTION 'Ajustement impossible : stock produit insuffisant (dispo: %)', COALESCE(available, 0)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_adjustments_availability ON public.inventory_adjustments;
CREATE TRIGGER trg_inventory_adjustments_availability
BEFORE INSERT ON public.inventory_adjustments
FOR EACH ROW EXECUTE FUNCTION public.enforce_adjustment_availability();

REVOKE ALL ON FUNCTION public.enforce_adjustment_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_sale_item_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_sale_item_availability_update() FROM PUBLIC;
